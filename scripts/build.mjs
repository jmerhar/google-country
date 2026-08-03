#!/usr/bin/env node
/**
 * Build the loadable extension into dist/.
 *
 * esbuild bundles the TypeScript entries (each pulling in shared.ts/countries.ts) into
 * self-contained IIFE scripts the MV3 manifest can load directly, then static assets are copied and
 * a finalised manifest.json is written. The manifest's `matches`/`host_permissions` and `version`
 * are generated here from the single sources of truth (src/google-domains.json, package.json) so
 * they can never drift from the DNR rule or the release tag.
 *
 * Usage: node scripts/build.mjs [--watch]
 */
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, watch as fsWatch, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const isWatch = process.argv.includes("--watch");

const read = (p) => readFileSync(p, "utf8");
const readJson = (p) => JSON.parse(read(p));

/** Write dist/manifest.json from the template + generated fields. */
function writeManifest() {
  const { version } = readJson(join(ROOT, "package.json"));
  const domains = readJson(join(SRC, "google-domains.json"));
  const manifest = readJson(join(SRC, "manifest.json"));

  manifest.version = version;
  manifest.host_permissions = domains.map((d) => `*://*.${d}/*`);
  manifest.content_scripts[0].matches = domains.map((d) => `*://*.${d}/search*`);

  // Optional: pin a public "key" (base64, no PEM headers) so unpacked/zip/crx share one extension
  // ID. Supply it via CRX_MANIFEST_KEY; omitted otherwise (Chrome then derives an ID per install).
  if (process.env.CRX_MANIFEST_KEY) manifest.key = process.env.CRX_MANIFEST_KEY.trim();

  writeFileSync(join(DIST, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

/** Copy the non-bundled assets into dist/. */
function copyStatic() {
  cpSync(join(SRC, "content.css"), join(DIST, "content.css"));
  cpSync(join(SRC, "icons"), join(DIST, "icons"), { recursive: true });
  writeManifest();
}

const buildOptions = {
  entryPoints: [join(SRC, "content.ts"), join(SRC, "background.ts")],
  outdir: DIST,
  bundle: true,
  format: "iife",
  target: "chrome110",
  platform: "browser",
  logLevel: "info",
  // Re-copy the static assets + regenerate the manifest after every (re)bundle so watch mode stays
  // in sync when TypeScript changes.
  plugins: [{ name: "static-assets", setup: (b) => b.onEnd(() => copyStatic()) }],
};

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  // esbuild only watches files in the JS import graph; watch the static inputs too so edits to CSS,
  // the manifest template, the domain list, or package.json version are reflected without a restart.
  for (const p of ["content.css", "manifest.json", "google-domains.json"]) {
    fsWatch(join(SRC, p), () => copyStatic());
  }
  fsWatch(join(ROOT, "package.json"), () => copyStatic());
  console.log("Watching src/ — reload the unpacked extension in chrome://extensions after changes.");
} else {
  await esbuild.build(buildOptions);
  console.log(`Built extension → ${DIST}`);
}
