import { defineConfig } from "vitest/config";
import { test } from "@jmerhar/frontend-config/vitest";

export default defineConfig({
  // The JUnit report feeds Codecov's test analytics, which tracks flaky tests, failure history and
  // run time.
  test: test({
    include: ["src/**/*.test.ts"],
    junit: true,
    coverage: {
      include: ["src/**/*.ts"],
      // content.ts is a 2-line browser bootstrap; background.ts's listener wiring runs only in the
      // extension. The tested logic lives in content-core.ts / shared.ts / background.ts functions.
      exclude: ["src/**/*.d.ts", "src/content.ts", "src/test-utils.ts"],
    },
  }),
});
