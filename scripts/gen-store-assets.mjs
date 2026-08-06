#!/usr/bin/env node
/**
 * Render the Chrome Web Store listing images with headless Chrome, at the exact sizes the dashboard
 * requires. Outputs to store/:
 *   - icon.png           128x128  store icon (identical to the extension's 128px icon)
 *   - screenshot.png     1280x800 product screenshot (widget open on a mock results page)
 *   - small-promo.jpg    440x280  small promo tile (JPEG = no alpha, as required)
 *   - marquee.jpg        1400x560 marquee promo tile (JPEG = no alpha)
 *
 * `sips` (macOS) flattens the promo tiles to JPEG. Re-run with `make store-assets`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { BLUE, BLUE2, frame, globeSvg, iconHtml, renderPng } from "./lib/brand.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "store");
const SRC = join(ROOT, "src");
const TMP = join(OUT, ".tmp");

// Render the *real* widget for the screenshot rather than a hand-maintained copy: bundle buildWidget
// from the content script and run it in the page against the real src/content.css. This way the store
// screenshot tracks the actual UI (new toggles, restyles, …) automatically and can never drift.
const contentCss = readFileSync(join(SRC, "content.css"), "utf8");
const widgetBundle = (
  await esbuild.build({
    stdin: {
      contents: 'import { buildWidget } from "./content-core.ts"; globalThis.gcoBuildWidget = buildWidget;',
      resolveDir: SRC,
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    logLevel: "silent",
  })
).outputFiles[0].text;

// A representative selection (country chosen, two favourites, panel open), positioned and themed
// exactly like the live extension via the real stylesheet and class names.
const widget = () => `
<style>${contentCss}</style>
<script>${widgetBundle}
(function () {
  var state = { override: { code: "JP", strict: false }, favourites: ["JP", "DE"], lang: "en", hideAds: true };
  var root = globalThis.gcoBuildWidget(state);
  root.classList.add("gco-fixed", "gco-light");
  root.querySelector(".gco-panel").removeAttribute("hidden");
  document.body.appendChild(root);
})();
</script>`;

// A light mock of a Google results page as a backdrop for the screenshot.
const resultsMock = () => `
<div style="padding:20px 28px">
  <div style="display:flex;align-items:center;gap:22px">
    <div style="font-size:26px;font-weight:500"><span style="color:#4285f4">G</span><span style="color:#ea4335">o</span><span style="color:#fbbc05">o</span><span style="color:#4285f4">g</span><span style="color:#34a853">l</span><span style="color:#ea4335">e</span></div>
    <div style="flex:1;max-width:600px;display:flex;align-items:center;border:1px solid #dfe1e5;border-radius:24px;padding:10px 18px;box-shadow:0 1px 6px rgba(32,33,36,.12);color:#202124">best coffee</div>
  </div>
  <div style="margin:26px 0 0 0;max-width:640px">
    ${[
      ["coffeereview.example", "The 30 Best Coffees — 2026 Reviews", "Our panel ranked hundreds of roasters. Here are the top single-origin and blend picks for espresso and filter this year."],
      ["beanjournal.example", "How to brew better coffee at home", "A practical guide to grind size, ratios and water temperature for pour-over, French press and moka pot."],
      ["localroasters.example", "Find specialty coffee near you", "Directory of independent roasters and cafés, with tasting notes and opening hours."],
    ].map(([u, t, d]) => `
      <div style="margin-bottom:24px">
        <div style="color:#202124;font-size:13px">${u}</div>
        <div style="color:#1a0dab;font-size:20px;margin:2px 0 3px">${t}</div>
        <div style="color:#4d5156;font-size:14px;line-height:1.5">${d}</div>
      </div>`).join("")}
  </div>
</div>`;

const promo = (w, h, titleSize, sub) => frame(w, h, `linear-gradient(135deg, ${BLUE} 0%, ${BLUE2} 100%)`, `
<div style="width:${w}px;height:${h}px;display:flex;align-items:center;gap:${Math.round(h * 0.09)}px;padding:0 ${Math.round(w * 0.08)}px;color:#fff">
  <div style="filter:drop-shadow(0 6px 14px rgba(0,0,0,.25))">${globeSvg(Math.round(h * 0.42))}</div>
  <div>
    <div style="font-size:${titleSize}px;font-weight:700;line-height:1.1">Google Country&nbsp;Override</div>
    ${sub ? `<div style="font-size:${Math.round(titleSize * 0.42)}px;opacity:.92;margin-top:${Math.round(h * 0.04)}px;max-width:${Math.round(w * 0.6)}px">${sub}</div>` : ""}
  </div>
</div>`);

const ASSETS = [
  { name: "icon.png", w: 128, h: 128, html: iconHtml(128) },
  { name: "screenshot.png", w: 1280, h: 800, html: frame(1280, 800, "#fff", resultsMock() + widget()) },
  { name: "small-promo.jpg", w: 440, h: 280, jpeg: true, html: promo(440, 280, 30, "Search from any country — same language.") },
  { name: "marquee.jpg", w: 1400, h: 560, jpeg: true, html: promo(1400, 560, 76, "Search Google as if you're in another country — while keeping results in your language.") },
];

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

for (const a of ASSETS) {
  const pngPath = a.jpeg ? join(TMP, `${a.name}.png`) : join(OUT, a.name);
  renderPng(a.html, a.w, a.h, pngPath);
  if (a.jpeg) {
    // Chrome only writes PNG; the promo tiles must be JPEG (no alpha). sips flattens + converts.
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", pngPath, "--out", join(OUT, a.name)], { stdio: "ignore" });
  }
  console.log(`Rendered store/${a.name} (${a.w}x${a.h})`);
}

rmSync(TMP, { recursive: true, force: true });
