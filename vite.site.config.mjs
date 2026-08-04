import { defineConfig } from "vite";
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Builds the GitHub Pages site (home / privacy / support) from site/ into site-dist/. Vite handles
// HTML, CSS, hashing and minification — no bespoke templating. The site is served from the project
// subpath, hence the base.
const here = import.meta.dirname;
const root = resolve(here, "site");

// Single source of truth for imagery: copy the committed store artwork into the site's public
// assets so the pages and the store listing never diverge. site/public is git-ignored (generated);
// regenerate store/ with `make store-assets`.
const assets = resolve(root, "public", "assets");
mkdirSync(assets, { recursive: true });
for (const f of ["icon.png", "screenshot.png", "marquee.jpg"]) {
  cpSync(resolve(here, "store", f), resolve(assets, f));
}

export default defineConfig({
  root,
  base: "/google-country/",
  build: {
    outDir: resolve(here, "site-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        privacy: resolve(root, "privacy.html"),
        support: resolve(root, "support.html"),
      },
    },
  },
});
