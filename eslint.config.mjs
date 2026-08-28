import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import noPerformanceClaims from "./eslint-rules/no-performance-claims.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  /**
   * `CLAUDE.md` §8.7 — no platform-authored performance claims, anywhere,
   * including seed data and demo content (§10). See the rule for what it does
   * not cover: comments, and model output at runtime.
   *
   * Scoped to `src/` because this is about shipped copy. Migrations and scripts
   * are neither read by a user nor rendered anywhere.
   */
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    plugins: { xwealth: { rules: { "no-performance-claims": noPerformanceClaims } } },
    rules: {
      "xwealth/no-performance-claims": [
        "error",
        {
          /**
           * Exemptions, each of which is a decision rather than an oversight.
           * A word earns a place here by being factual about a *state* rather
           * than a judgement about performance.
           */
          allow: [],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
