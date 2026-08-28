import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    /**
     * `eslint-rules/` is included because the performance-claims rule is the
     * only thing in CI that can read prose, and an unattacked lint rule is a
     * guess. Its tests live beside it rather than under `src/`, which holds
     * the application.
     */
    include: ["src/**/*.test.ts", "eslint-rules/**/*.test.ts"],
  },
});
