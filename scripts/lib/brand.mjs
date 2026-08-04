/**
 * Shared brand assets for the icon and store/site graphics, so there is a single source of truth for
 * the logo. The mark is a globe (white disc with blue meridians) on a blue rounded tile — no map
 * marker — sized to the same circle proportion as the toolbar icon.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const BLUE = "#1a73e8";
export const BLUE2 = "#1558d6";

/** Exact-size HTML page whose body equals the given dimensions (so a screenshot is pixel-exact). */
export const frame = (w, h, bg, inner) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{font-family:Roboto,Arial,system-ui,sans-serif;background:${bg}}
</style></head><body>${inner}</body></html>`;

/** The globe mark (white disc + blue meridians), no map marker. */
export const globeSvg = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="34" fill="#fff"/>
  <g stroke="${BLUE}" stroke-width="3" fill="none">
    <circle cx="50" cy="50" r="34"/>
    <ellipse cx="50" cy="50" rx="14" ry="34"/>
    <line x1="16" y1="50" x2="84" y2="50"/>
    <line x1="22" y1="32" x2="78" y2="32"/>
    <line x1="22" y1="68" x2="78" y2="68"/>
  </g>
</svg>`;

/**
 * The app icon: a full-bleed blue rounded tile with the globe centred. The globe circle spans ~64%
 * of the canvas, matching the toolbar icon's proportions.
 */
export const iconHtml = (canvas) => {
  const radius = Math.round(canvas * 0.22);
  const globe = Math.round(canvas * 0.94); // globe circle is ~0.68 of the svg box → ~0.64 of canvas
  return frame(canvas, canvas, "transparent",
    `<div style="width:${canvas}px;height:${canvas}px;background:linear-gradient(135deg,${BLUE},${BLUE2});border-radius:${radius}px;display:flex;align-items:center;justify-content:center">${globeSvg(globe)}</div>`);
};

/** Render an HTML string to a PNG of the given size with headless Chrome (transparent background). */
export const renderPng = (html, w, h, outPath) => {
  const htmlPath = join(mkdtempSync(join(tmpdir(), "gco-")), "page.html");
  writeFileSync(htmlPath, html);
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--default-background-color=00000000",
    "--force-device-scale-factor=1",
    `--window-size=${w},${h}`,
    `--screenshot=${outPath}`,
    `file://${htmlPath}`,
  ], { stdio: "ignore" });
};
