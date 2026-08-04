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
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BLUE, BLUE2, frame, globeSvg, iconHtml, renderPng } from "./lib/brand.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "store");
const TMP = join(OUT, ".tmp");

// The real widget, styled to match src/content.css, for the product screenshot.
const widget = () => `
<style>
 .gco{position:absolute;right:28px;bottom:28px;font-size:14px;color:#202124}
 .pill{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:#fff;border:1px solid #dadce0;border-radius:999px;box-shadow:0 4px 14px rgba(32,33,36,.22)}
 .caret{color:#5f6368;font-size:11px}
 .panel{position:absolute;right:0;bottom:calc(100% + 8px);width:320px;background:#fff;border:1px solid #dadce0;border-radius:12px;box-shadow:0 8px 24px rgba(32,33,36,.28);overflow:hidden}
 .filter{margin:10px;padding:8px 10px;border:1px solid #dadce0;border-radius:8px;color:#5f6368}
 .sec{padding:8px 12px 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#5f6368}
 .row{display:flex;align-items:center;gap:10px;padding:8px 12px}
 .row:hover{background:#f1f3f4}
 .flag{font-size:18px}
 .name{flex:1}
 .star{color:#f9ab00}
 .strict{display:flex;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid #dadce0;color:#5f6368;font-size:13px}
</style>
<div class="gco">
 <div class="panel">
  <div class="filter">Search countries…</div>
  <div class="sec">Favourites</div>
  <div class="row"><span class="flag">🇯🇵</span><span class="name">Japan</span><span class="star">★</span></div>
  <div class="row"><span class="flag">🇩🇪</span><span class="name">Germany</span><span class="star">★</span></div>
  <div class="sec">All countries</div>
  <div class="row"><span class="flag">🇦🇺</span><span class="name">Australia</span><span style="color:#5f6368">☆</span></div>
  <div class="row"><span class="flag">🇧🇷</span><span class="name">Brazil</span><span style="color:#5f6368">☆</span></div>
  <div class="strict"><input type="checkbox"> Strict — only pages from this country</div>
 </div>
 <div class="pill"><span class="flag">🇯🇵</span><span>Japan</span><span class="caret">▾</span></div>
</div>`;

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
