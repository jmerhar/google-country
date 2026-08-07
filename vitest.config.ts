import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // json-summary drives the coverage summary and gate; lcov feeds Codecov + the published HTML.
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      // content.ts is a 2-line browser bootstrap; background.ts's listener wiring runs only in the
      // extension. The tested logic lives in content-core.ts / shared.ts / background.ts functions.
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/content.ts", "src/test-utils.ts"],
    },
  },
});
