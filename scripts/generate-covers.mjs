// Generates a 1200x630 cover image for every blog post that doesn't set `image`
// (or for all posts with --force). Each cover shows the post's tags and a
// highlighted snippet from its own first code block.
//
// Needs Playwright with Chromium, which is not a site dependency:
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/generate-covers.mjs [--force]

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { codeToHtml } from "shiki";

const BLOG_DIR = "src/content/blog";
const OUT_DIR = "public/images/blog";
const force = process.argv.includes("--force");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm i --no-save playwright && npx playwright install chromium");
  process.exit(1);
}


const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function parse(file) {
  const raw = readFileSync(file, "utf8");
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)[1];
  const tags = JSON.parse(fm.match(/^tags:\s*(\[.*\])/m)?.[1] ?? "[]");
  const date = fm.match(/^date:\s*(\S+)/m)?.[1] ?? "";
  const title = JSON.parse(fm.match(/^title:\s*(".*")/m)?.[1] ?? '""');
  const hasImage = /^image:/m.test(fm);
  // Prefer the first code block with 7+ lines, then any with 4+
  const blocks = [...raw.matchAll(/```(\w+)?\n([\s\S]*?)```/g)]
    .map((m) => ({ lang: m[1] || "text", code: m[2], lines: m[2].trim().split("\n").length }));
  const block = blocks.find((b) => b.lines >= 7) ?? blocks.find((b) => b.lines >= 4);
  return { title, tags, date, hasImage, block };
}

async function snippetHtml(block, title) {
  if (!block) {
    // No code in the post: show its title instead
    return `<div class="title-only">${escape(title)}</div>`;
  }
  const lines = block.code.replace(/\s+$/, "").split("\n").slice(0, 13);
  const lang = { yml: "yaml", sh: "bash", dockerfile: "docker" }[block.lang] ?? block.lang;
  try {
    return await codeToHtml(lines.join("\n"), { lang, theme: "github-dark" });
  } catch {
    return await codeToHtml(lines.join("\n"), { lang: "text", theme: "github-dark" });
  }
}

// Site fonts, embedded so the page needs no network or file access
const font = (pkg, file) =>
  readFileSync(new URL(`../node_modules/@fontsource-variable/${pkg}/files/${file}`, import.meta.url)).toString("base64");
const fonts = `
  @font-face { font-family: "Geist"; font-weight: 100 900; src: url(data:font/woff2;base64,${font("geist", "geist-latin-wght-normal.woff2")}) format("woff2"); }
  @font-face { font-family: "Geist Mono"; font-weight: 100 900; src: url(data:font/woff2;base64,${font("geist-mono", "geist-mono-latin-wght-normal.woff2")}) format("woff2"); }`;

// Matches the site's dark theme: neutral background, one green accent
function page({ tags, date, snippet, lang }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
  * { box-sizing: border-box; }
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; position: relative;
    font-family: Geist, sans-serif; color: #ededef; background: #09090b; }
  .grid { position: absolute; inset: 0; opacity: .05;
    background-image: linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px);
    background-size: 48px 48px; }
  .glow { position: absolute; width: 760px; height: 760px; border-radius: 50%; background: #4ade80;
    filter: blur(200px); opacity: .10; right: -260px; bottom: -420px; }
  .meta { position: absolute; left: 64px; right: 64px; top: 44px; display: flex; justify-content: space-between;
    font: 20px "Geist Mono", monospace; color: #8b8b93; }
  .meta b { font-weight: 500; color: #ededef; }
  .win { position: absolute; left: 64px; right: 64px; top: 104px; height: 400px; border-radius: 14px;
    background: #111113; border: 1px solid #27272a; overflow: hidden; }
  .bar { height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 18px; border-bottom: 1px solid #232326;
    font: 16px "Geist Mono", monospace; color: #8b8b93; }
  .bar i { width: 11px; height: 11px; border-radius: 50%; background: #3f3f46; display: block; }
  .bar span { margin-left: 10px; }
  .code { padding: 22px 28px; font: 20px/1.55 "Geist Mono", monospace; }
  .code pre { margin: 0; background: transparent !important; white-space: pre; font-family: inherit; }
  .fade { position: absolute; left: 0; right: 0; bottom: 0; height: 110px; background: linear-gradient(transparent, #111113); }
  .tags { position: absolute; left: 64px; bottom: 46px; display: flex; gap: 22px; align-items: center;
    font: 21px "Geist Mono", monospace; color: #8b8b93; }
  .tags .dot { width: 9px; height: 9px; border-radius: 50%; background: #4ade80; }
  .title-only { font: 600 58px/1.12 Geist, sans-serif; letter-spacing: -.035em; padding: 44px 24px; }
  .title-only::before { content: "# "; color: #4ade80; font-family: "Geist Mono"; }
  </style></head><body>
  <div class="grid"></div><div class="glow"></div>
  <div class="meta"><span><b>Varij Kapil</b> · writing</span><span>${escape(date)}</span></div>
  <div class="win"><div class="bar"><i></i><i></i><i></i><span>${escape(lang)}</span></div>
  <div class="code">${snippet}</div><div class="fade"></div></div>
  <div class="tags"><span class="dot"></span>${tags.slice(0, 4).map((t) => `<span>${escape(t)}</span>`).join("")}</div>
  </body></html>`;
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });

for (const name of readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md"))) {
  const file = join(BLOG_DIR, name);
  const id = basename(name, ".md");
  const post = parse(file);
  if (post.hasImage && !force) continue;

  const lang = post.block ? post.block.lang : "notes";
  await tab.setContent(page({ tags: post.tags, date: post.date, lang, snippet: await snippetHtml(post.block, post.title) }));
  const out = `${OUT_DIR}/${id}.jpg`;
  await tab.screenshot({ path: out, type: "jpeg", quality: 82 });

  // Point the post at its cover
  // Only touch the front matter: a post body can contain `image:` too (e.g. Helm values)
  if (!post.hasImage) {
    const raw = readFileSync(file, "utf8");
    writeFileSync(file, raw.replace(/^(---\n[\s\S]*?^date:.*)$/m, `$1\nimage: "/images/blog/${id}.jpg"`));
  }
  console.log(`cover: ${out}`);
}

await browser.close();
