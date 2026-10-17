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
  runtime: "#0067b1", data: "#007a4d", platform: "#ef7d00",
  operations: "#8a3d99", security: "#d3131c", team: "#8c6239",
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
const font = (pkg, file) =>
  readFileSync(new URL(`../node_modules/@fontsource/${pkg}/files/${file}`, import.meta.url)).toString("base64");
const fonts = `
  @font-face { font-family: "Barlow"; font-weight: 600; src: url(data:font/woff2;base64,${font("barlow", "barlow-latin-600-normal.woff2")}) format("woff2"); }
  @font-face { font-family: "Barlow Condensed"; font-weight: 700; src: url(data:font/woff2;base64,${font("barlow-condensed", "barlow-condensed-latin-700-normal.woff2")}) format("woff2"); }`;

const base = `${fonts}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; position: relative; background: #fff; color: #101318; font-family: Barlow, sans-serif; }
  .sign { position: absolute; inset: 0 0 auto 0; height: 420px; background: #0b2b5e; color: #fff; padding: 52px 64px 0; }
  .bullet { display: inline-flex; width: 52px; height: 52px; border-radius: 9px; align-items: center; justify-content: center; font: 700 34px/1 "Barlow Condensed"; color: #fff; }
  .line-name { display: flex; align-items: center; gap: 16px; font: 700 30px/1 "Barlow Condensed"; }
  .line-name span.muted { color: #bccbe3; }
  h1 { font: 700 70px/0.98 "Barlow Condensed"; letter-spacing: -0.01em; margin-top: 30px; max-width: 1040px; }
  .foot { position: absolute; left: 64px; right: 64px; bottom: 34px; display: flex; justify-content: space-between; font: 600 22px Barlow; color: #565d68; }
  .strip { position: absolute; left: 64px; right: 64px; top: 466px; display: flex; }
  .strip div { position: relative; flex: 1; padding-top: 36px; font: 700 21px/1 "Barlow Condensed"; color: #565d68; white-space: nowrap; }
  .strip div::before { content: ""; position: absolute; left: 0; right: 0; top: 4px; height: 9px; background: var(--c); }
  .strip div::after { content: ""; position: absolute; left: 0; top: 0; width: 8px; height: 17px; background: var(--c); }
  .strip div.here { color: #101318; }
  .strip div.here::after, .strip div.hub::after { left: -6px; top: -6px; width: 28px; height: 28px; border-radius: 50%; background: #fff; border: 6px solid #101318; }
  .strip div.hub { flex: 0 0 auto; }
  .strip div.hub::before { right: auto; width: 12px; }`;

function coverPage(title, { line, index }) {
  const c = colors[line.id];
  const textColor = line.id === "platform" ? "#1b1200" : "#fff";
  const stations = line.stations
    .map((s, i) => `<div class="${i === index ? "here" : ""}">${escape(label(s.label))}</div>`)
    .join("");
  const size = title.length > 70 ? 58 : title.length > 48 ? 64 : 74;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}</style></head><body style="--c:${c}">
  <div class="sign">
    <p class="line-name"><span class="bullet" style="background:${c};color:${textColor}">${line.code}</span>${escape(line.name.en)} line <span class="muted">· ${escape(label(line.stations[index].label))}</span></p>
    <h1 style="font-size:${size}px">${escape(title)}</h1>
  </div>
  <div class="strip">${stations}<div class="hub">Today</div></div>
  <p class="foot"><span>Varij Kapil</span><span>varij.dev</span></p>
  </body></html>`;
}

// The site image: the name on a sign, and every line running into today's interchange
function ogPage() {
  const rows = network.lines
    .map((l, i) => {
      const y = 448 + i * 22;
      const x = 1000 - l.stations.length * 110;
      const ticks = l.stations.map((_, j) => `<rect x="${x + j * 110}" y="${y - 7}" width="6" height="10" fill="${colors[l.id]}"/>`).join("");
      return `<rect x="${x}" y="${y}" width="${1040 - x}" height="7" fill="${colors[l.id]}"/>${ticks}`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
    .sign { height: 400px; }
    h1 { font-size: 120px; margin-top: 18px; }
    .role { font: 700 40px/1.1 "Barlow Condensed"; margin-top: 18px; }
    .lead { font: 600 26px/1.3 Barlow; color: #bccbe3; margin-top: 18px; }
    svg { position: absolute; left: 0; top: 0; }
  </style></head><body>
  <div class="sign">
    <h1>Varij Kapil</h1>
    <p class="role">Head of Backend Engineering &amp; Operations</p>
    <p class="lead">Taking a Java EE monolith to multi-tenant SaaS, one station at a time.</p>
  </div>
  <svg width="1200" height="630">${rows}<rect x="1026" y="434" width="30" height="${(network.lines.length - 1) * 22 + 34}" rx="15" fill="#fff" stroke="#101318" stroke-width="6"/></svg>
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
