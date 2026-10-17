// Generates a 1200x630 cover image for every blog post that doesn't set `image`
// (or for all posts with --force). Each cover is a station sign: the post's
// title on navy, with its line from the network map drawn underneath and its
// own station marked. With --og it also redraws the site image, public/og-image.png.
//
// Needs Playwright with Chromium, which is not a site dependency:
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/generate-covers.mjs [--force] [--og]

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

const BLOG_DIR = "src/content/blog";
const OUT_DIR = "public/images/blog";
const force = process.argv.includes("--force");
const og = process.argv.includes("--og");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm i --no-save playwright && npx playwright install chromium");
  process.exit(1);
}

const network = JSON.parse(readFileSync("src/data/network.json", "utf8"));
const colors = {
  runtime: "#5b8cff", data: "#34c48b", platform: "#f5a524",
  operations: "#a78bfa", security: "#f2555a", team: "#c99a66",
};
const label = (l) => (typeof l === "string" ? l : l.en);
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function parse(file) {
  const raw = readFileSync(file, "utf8");
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)[1];
  const title = JSON.parse(fm.match(/^title:\s*(".*")/m)?.[1] ?? '""');
  const hasImage = /^image:/m.test(fm);
  return { title, hasImage };
}

function findStation(id) {
  for (const line of network.lines) {
    const index = line.stations.findIndex((s) => s.post === id);
    if (index >= 0) return { line, index };
  }
}

// Site fonts, embedded so the page needs no network or file access
const font = (path) => readFileSync(new URL(`../node_modules/${path}`, import.meta.url)).toString("base64");
const fonts = `
  @font-face { font-family: "Geist"; font-weight: 100 900; src: url(data:font/woff2;base64,${font("@fontsource-variable/geist/files/geist-latin-wght-normal.woff2")}) format("woff2"); }
  @font-face { font-family: "Geist Mono"; font-weight: 100 900; src: url(data:font/woff2;base64,${font("@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2")}) format("woff2"); }`;

// Matches the site's dark theme: near-black ground, hairlines, one colour per line
const base = `${fonts}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; position: relative; background: #08090a; color: #f4f5f6; font-family: Geist, sans-serif; }
  .glow { position: absolute; inset: 0; background: radial-gradient(60% 90% at 50% -25%, rgb(110 140 255 / 0.16), transparent 70%); }
  .grid { position: absolute; inset: 0; background-image: radial-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px); background-size: 24px 24px; }
  .wrap { position: absolute; inset: 0; padding: 60px 72px; }
  .bullet { display: inline-flex; width: 30px; height: 30px; border-radius: 8px; align-items: center; justify-content: center; font: 600 17px/1 Geist; color: #08090a; }
  .line-name { display: flex; align-items: center; gap: 14px; font: 500 24px/1 Geist; color: #f4f5f6; }
  .line-name span.muted { color: #8b8f98; }
  h1 { font: 600 66px/1.04 Geist; letter-spacing: -0.04em; margin-top: 34px; max-width: 1020px; }
  .foot { position: absolute; left: 72px; right: 72px; bottom: 52px; display: flex; justify-content: space-between; font: 400 20px "Geist Mono"; color: #8b8f98; }
  .strip { position: absolute; left: 72px; right: 72px; top: 452px; display: flex; }
  .strip div { position: relative; flex: 1; padding-top: 28px; font: 400 18px/1 Geist; color: #8b8f98; white-space: nowrap; }
  .strip div::before { content: ""; position: absolute; left: 0; right: 0; top: 6px; height: 4px; background: var(--c); }
  .strip div::after { content: ""; position: absolute; left: 0; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--c); }
  .strip div.here { color: #f4f5f6; font-weight: 600; }
  .strip div.here::after { left: -3px; top: -1px; width: 18px; height: 18px; box-shadow: 0 0 0 6px color-mix(in srgb, var(--c) 30%, transparent); }
  .strip div.hub { flex: 0 0 auto; color: #f4f5f6; }
  .strip div.hub::after { left: -3px; top: -1px; width: 18px; height: 18px; background: #08090a; border: 3px solid #f4f5f6; }
  .strip div.hub::before { right: auto; width: 8px; }`;

function coverPage(title, { line, index }) {
  const c = colors[line.id];
  const stations = line.stations
    .map((st, i) => `<div class="${i === index ? "here" : ""}">${escape(label(st.label))}</div>`)
    .join("");
  const size = title.length > 70 ? 54 : title.length > 48 ? 60 : 68;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}</style></head><body style="--c:${c}">
  <div class="grid"></div><div class="glow"></div>
  <div class="wrap">
    <p class="line-name"><span class="bullet" style="background:${c}">${line.code}</span>${escape(line.name.en)} line <span class="muted">· ${escape(label(line.stations[index].label))}</span></p>
    <h1 style="font-size:${size}px">${escape(title)}</h1>
  </div>
  <div class="strip">${stations}<div class="hub">Today</div></div>
  <p class="foot"><span>Varij Kapil</span><span>varij.dev</span></p>
  </body></html>`;
}

// The site image: name and role, and every line running into today's interchange
function ogPage() {
  const rows = network.lines
    .map((l, i) => {
      const y = 420 + i * 24;
      const x = 1000 - l.stations.length * 104;
      const dots = l.stations.map((_, j) => `<circle cx="${x + j * 104}" cy="${y + 1.5}" r="5" fill="${colors[l.id]}"/>`).join("");
      return `<rect x="${x}" y="${y}" width="${1040 - x}" height="3" rx="1.5" fill="${colors[l.id]}"/>${dots}`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
    h1 { font-size: 104px; margin-top: 0; }
    .role { font: 500 36px/1.2 Geist; letter-spacing: -0.02em; color: #8b8f98; margin-top: 16px; }
    svg { position: absolute; left: 0; top: 0; }
  </style></head><body>
  <div class="grid"></div><div class="glow"></div>
  <div class="wrap">
    <h1>Varij Kapil</h1>
    <p class="role">Head of Backend Engineering &amp; Operations</p>
  </div>
  <svg width="1200" height="630">${rows}<rect x="1032" y="408" width="18" height="${(network.lines.length - 1) * 24 + 27}" rx="9" fill="#08090a" stroke="#f4f5f6" stroke-width="3"/></svg>
  <p class="foot"><span>varij.dev</span></p>
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
  const at = findStation(id);
  if (!at) {
    console.warn(`skip ${id}: not on the network map (src/data/network.json)`);
    continue;
  }

  await tab.setContent(coverPage(post.title, at));
  const out = `${OUT_DIR}/${id}.jpg`;
  await tab.screenshot({ path: out, type: "jpeg", quality: 86 });

  // Point the post at its cover
  // Only touch the front matter: a post body can contain `image:` too (e.g. Helm values)
  if (!post.hasImage) {
    const raw = readFileSync(file, "utf8");
    writeFileSync(file, raw.replace(/^(---\n[\s\S]*?^date:.*)$/m, `$1\nimage: "/images/blog/${id}.jpg"`));
  }
  console.log(`cover: ${out}`);
}

if (og) {
  await tab.setContent(ogPage());
  await tab.screenshot({ path: "public/og-image.png" });
  console.log("site image: public/og-image.png");
}

await browser.close();
