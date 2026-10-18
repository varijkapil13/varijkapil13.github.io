// Renders the post diagrams in scripts/diagrams/*.html to the PNGs named by
// each figure's data-out attribute, at 2x for sharp text.
//
// Needs Playwright with Chromium, which is not a site dependency:
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/render-diagrams.mjs

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import("playwright");
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 });

for (const name of readdirSync("scripts/diagrams").filter((f) => f.endsWith(".html"))) {
  await tab.goto(pathToFileURL(resolve("scripts/diagrams", name)).href);
  await tab.evaluate(() => document.fonts.ready);
  for (const figure of await tab.$$("figure[data-out]")) {
    const out = await figure.getAttribute("data-out");
    await figure.screenshot({ path: out });
    console.log(`diagram: ${out}`);
  }
}

await browser.close();
