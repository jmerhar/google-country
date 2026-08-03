#!/usr/bin/env bash
# Assemble the HTML coverage report + a reports.json manifest into <out>, ready to publish to the
# jmerhar/coverage site via that repo's bin/add-report.sh. This project has a single suite
# ("extension"), so the subdir name matches the suite key (== reports.json `path`) that the site
# links to.
#
# Usage: scripts/collect-coverage.sh [output-dir]   (default: coverage-upload)
# Run from the repo root after `vitest run --coverage` has produced coverage/.
set -euo pipefail

out="${1:-coverage-upload}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"

rm -rf "$out"
mkdir -p "$out"
cp -r "$root/coverage" "$out/extension"
python3 "$here/coverage-report.py" --format reports > "$out/reports.json"

echo "Collected coverage upload in $out/ (suite: extension)"
