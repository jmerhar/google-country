import { base, node } from "@jmerhar/frontend-config/eslint";

// The extension's TypeScript runs in the browser with the extension API's `chrome` global; the
// build and pack scripts, and the configuration files, run in Node.
export default [
  ...base({ files: ["src/**/*.ts"], ignores: ["site-dist", "site/public"], globals: { chrome: "readonly" } }),
  node(["scripts/**/*.mjs"]),
];
