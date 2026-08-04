#!/usr/bin/env node
/**
 * Generate the extension's toolbar/store icons (src/icons/icon{16,48,128}.png) from the shared brand
 * mark. The 128px icon is rendered with headless Chrome, then downscaled to 48 and 16 with `sips`
 * for clean antialiasing at small sizes. Re-run with `make icons` (needs Chrome + sips).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { iconHtml, renderPng } from "./lib/brand.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "icons");
mkdirSync(OUT, { recursive: true });

const icon128 = join(OUT, "icon128.png");
renderPng(iconHtml(128), 128, 128, icon128);
for (const size of [48, 16]) {
  execFileSync("sips", ["-z", String(size), String(size), icon128, "--out", join(OUT, `icon${size}.png`)], { stdio: "ignore" });
}
console.log(`Wrote icon16.png, icon48.png, icon128.png to ${OUT}`);
