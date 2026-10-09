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

// Background tint by topic, picked from the first matching tag
const palettes = [
  { tags: ["kubernetes", "gitops", "helm", "pulumi", "docker", "containers"], from: "#0c4a6e", to: "#1e3a8a", accent: "#38bdf8" },
  { tags: ["postgresql", "database", "oracle"], from: "#134e4a", to: "#0c4a6e", accent: "#2dd4bf" },
  { tags: ["security", "oauth"], from: "#14532d", to: "#134e4a", accent: "#4ade80" },
  { tags: ["devops", "cicd", "gitlab"], from: "#3b0764", to: "#1e1b4b", accent: "#c084fc" },
  { tags: ["observability", "monitoring", "logging", "debugging"], from: "#422006", to: "#3b0764", accent: "#fbbf24" },
  { tags: ["team-topologies", "leadership", "organization"], from: "#500724", to: "#3b0764", accent: "#f472b6" },
  { tags: ["java", "quarkus", "jakarta-ee", "payara"], from: "#431407", to: "#4a044e", accent: "#fb923c" },
];

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function parse(file) {
  const raw = readFileSync(file, "utf8");
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)[1];
  const tags = JSON.parse(fm.match(/^tags:\s*(\[.*\])/m)?.[1] ?? "[]");
  const title = JSON.parse(fm.match(/^title:\s*(".*")/m)?.[1] ?? '""');
  const hasImage = /^image:/m.test(fm);
  // Prefer the first code block with 7+ lines, then any with 4+
  const blocks = [...raw.matchAll(/```(\w+)?\n([\s\S]*?)```/g)]
    .map((m) => ({ lang: m[1] || "text", code: m[2], lines: m[2].trim().split("\n").length }));
  const block = blocks.find((b) => b.lines >= 7) ?? blocks.find((b) => b.lines >= 4);
  return { title, tags, hasImage, block };
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

function page({ tags, snippet, palette }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; position: relative;
    font-family: Inter, system-ui, sans-serif; color: #f8fafc;
    background: linear-gradient(135deg, ${palette.from}, ${palette.to}); }
  .glow { position: absolute; width: 700px; height: 700px; border-radius: 50%;
    background: ${palette.accent}; filter: blur(160px); opacity: .28; right: -200px; top: -260px; }
  .grid { position: absolute; inset: 0; opacity: .08;
    background-image: linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px);
    background-size: 40px 40px; }
  .tags { position: absolute; left: 64px; bottom: 56px; display: flex; gap: 12px; }
  .tags span { font-size: 22px; font-weight: 600; padding: 8px 18px; border-radius: 999px;
    background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.18); }
  .win { position: absolute; left: 64px; right: 64px; top: 56px; height: 410px; border-radius: 18px;
    background: #0d1117; box-shadow: 0 30px 80px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.12); overflow: hidden; }
  .bar { height: 44px; display: flex; align-items: center; gap: 9px; padding: 0 18px; background: #161b22; }
  .bar i { width: 13px; height: 13px; border-radius: 50%; display: block; }
  .code { padding: 22px 28px; font: 21px/1.5 "JetBrains Mono", ui-monospace, monospace; }
  .code pre { margin: 0; background: transparent !important; white-space: pre; }
  .fade { position: absolute; left: 0; right: 0; bottom: 0; height: 90px; background: linear-gradient(transparent, #0d1117); }
  .title-only { font: 700 60px/1.2 Inter, sans-serif; color: #f8fafc; padding: 40px 20px; letter-spacing: -1px; }
  .title-only::before { content: "# "; color: ${palette.accent}; }
  </style></head><body>
  <div class="grid"></div><div class="glow"></div>
  <div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
  <div class="code">${snippet}</div><div class="fade"></div></div>
  <div class="tags">${tags.slice(0, 4).map((t) => `<span>${escape(t)}</span>`).join("")}</div>
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

  const palette = palettes.find((p) => post.tags.some((t) => p.tags.includes(t))) ?? palettes.at(-1);
  await tab.setContent(page({ tags: post.tags, snippet: await snippetHtml(post.block, post.title), palette }));
  const out = `${OUT_DIR}/${id}.jpg`;
  await tab.screenshot({ path: out, type: "jpeg", quality: 82 });

  // Point the post at its cover
  const raw = readFileSync(file, "utf8");
  if (!/^image:/m.test(raw)) {
    writeFileSync(file, raw.replace(/^(date:.*)$/m, `$1\nimage: "/images/blog/${id}.jpg"`));
  }
  console.log(`cover: ${out}`);
}

await browser.close();
