#!/usr/bin/env node
/**
 * Sign the built dist/ into a .crx plus an updates.xml auto-update manifest.
 *
 * Shared by `make crx` and the release workflow so local and CI packaging are identical. The signing
 * key determines the extension ID, so a stable key (the CRX_PRIVATE_KEY secret in CI; secrets/key.pem
 * locally) keeps the ID constant across releases and lets `updates.xml` drive auto-updates.
 *
 * Usage: node scripts/pack-crx.mjs --key <secrets/key.pem> [--url <crx-download-url>]
 *
 * Note: modern desktop Chrome blocks .crx installs from outside the Web Store (dev/enterprise only);
 * the .crx + updates.xml are mainly for Kiwi and enterprise-policy/manual installs.
 */
import crx3 from "crx3";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const keyPath = arg("key", "secrets/key.pem");
const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const crxPath = arg("out", join(ROOT, `google-country-${version}.crx`));
const xmlPath = join(ROOT, "updates.xml");
// The stable URL Chrome/Kiwi fetch the crx from for auto-update; override per release as needed.
const crxURL = arg("url", process.env.CRX_URL || "https://jmerhar.github.io/google-country/google-country.crx");
// --no-update builds the store crx: no update_url and no updates.xml. The Chrome Web Store manages
// updates itself (and its guidance is to omit update_url), so the crx uploaded for Verified CRX
// uploads must not carry one. The default (self-hosted) crx does get an update_url + updates.xml.
const noUpdate = process.argv.includes("--no-update");

if (!existsSync(join(ROOT, "dist", "manifest.json"))) {
  console.error("dist/manifest.json not found — run `npm run build` first.");
  process.exit(1);
}
if (!existsSync(keyPath)) {
  console.error(`Signing key not found at ${keyPath} — run \`make keygen\` or pass --key <path>.`);
  process.exit(1);
}

const manifestPath = "dist/manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const updateUrl = crxURL.replace(/[^/]*$/, "updates.xml");
if (noUpdate) delete manifest.update_url;
else manifest.update_url = updateUrl;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

await crx3(["dist/manifest.json"], noUpdate ? { keyPath, crxPath } : { keyPath, crxPath, xmlPath, crxURL });
console.log(noUpdate
  ? `Packed ${crxPath} (store crx, no update_url)`
  : `Packed ${crxPath}\nWrote  ${xmlPath} (codebase ${crxURL}, update_url ${updateUrl})`);
