#!/usr/bin/env bash
# Build the GitHub Pages site into site-dist/, with the latest release's downloads beside it:
# the zip, the signed crx and updates.xml, the crx and zip under version-free names the site links.
#
# Run by the Pages workflow, with GH_TOKEN set for gh. The current version's release is preferred,
# then the latest; before the first release the site simply has no downloads.
#
# Usage: scripts/build-site.sh
set -euo pipefail

cd "$(dirname "$0")/.."
npm run site

version="v$(node -p "require('./package.json').version")"
patterns=(--pattern '*.crx' --pattern '*.zip' --pattern 'updates.xml')
gh release download "$version" "${patterns[@]}" -D site-dist \
  || gh release download "${patterns[@]}" -D site-dist \
  || echo "build-site: no release assets yet"
for ext in crx zip; do
  if ls site-dist/google-country-*."$ext" >/dev/null 2>&1; then
    mv site-dist/google-country-*."$ext" "site-dist/google-country.$ext"
  fi
done
