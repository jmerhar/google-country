#!/usr/bin/env node
/**
 * Print the CHANGELOG.md section for a given version to stdout, for use as the GitHub Release body.
 *
 * Usage: node scripts/release-notes.mjs <version>   (a leading "v" is tolerated)
 * Exits non-zero if there is no matching `## [version]` section, so a release can't ship with empty
 * notes.
 */
import { readFileSync } from "node:fs";

const version = (process.argv[2] || "").replace(/^v/, "");
if (!version) {
  console.error("usage: release-notes.mjs <version>");
  process.exit(1);
}

const lines = readFileSync("CHANGELOG.md", "utf8").split("\n");
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const start = lines.findIndex((l) => new RegExp(`^## \\[${escaped}\\]`).test(l));
if (start === -1) {
  console.error(`No CHANGELOG.md entry for ${version}`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
if (end === -1) end = lines.length;

console.log(lines.slice(start + 1, end).join("\n").trim());
