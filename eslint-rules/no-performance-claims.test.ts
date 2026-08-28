import { RuleTester, type Rule } from "eslint";
import { describe, it } from "vitest";

import ruleModule from "./no-performance-claims.mjs";

// The rule is plain `.mjs`, so it arrives as a structural object rather than
// something TypeScript recognises as a RuleModule. Asserted at the boundary,
// once, instead of scattering suppressions through the cases below.
const rule = ruleModule as unknown as Rule.RuleModule;

/**
 * The rule is the only thing in CI that can read prose, so it is worth
 * attacking properly.
 *
 * Both directions matter equally. A rule that flags nothing is theatre; a rule
 * that flags legitimate trading vocabulary gets suppressed within a week and
 * then flags nothing. The `valid` cases below are the ones that keep it usable.
 */
const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe("no-performance-claims", () => {
  it("passes RuleTester", () => {
    tester.run("no-performance-claims", rule, {
      valid: [
        // --- trading vocabulary that must never be flagged -----------------
        //
        // "best bid" and "best ask" name real order-book levels. A rule that
        // failed on these would be suppressed, and then it protects nothing.
        { code: 'const label = "best bid";' },
        { code: 'const label = "Best ask, then the spread";' },

        // A user's self-reported experience level is not us grading anyone.
        { code: 'const levels = ["BEGINNER", "EXPERT"];' },
        { code: 'const title = "Expert";' },

        // --- factual reporting, which is the whole point of the product ----
        { code: 'const copy = "42 trades is below the threshold for confidence at this win rate";' },
        { code: 'const copy = "Net return −4.71%, 15 trades, 7.4% drawdown";' },
        { code: 'const copy = "This drawdown is within the expected range. No change indicated.";' },

        // --- not prose ------------------------------------------------------
        { code: 'import x from "./verified-thing.mjs";' },
        { code: 'const f = "verify_invariants.sql";' },
        { code: 'const u = "https://example.com/quality";' },

        // A comment recording what was removed is the opposite of a violation,
        // and every current mention in this codebase is exactly that.
        { code: "// we used to tick Verified Experts and Quality Signals here" },
        { code: "/** Quality trading signals — the line this replaced. */" },

        // Explicitly exempted, which makes it a decision on the record.
        {
          code: 'const heading = "Trade quality";',
          options: [{ allow: ["Trade quality"] }],
        },
      ],

      invalid: [
        // --- the two that actually shipped ---------------------------------
        {
          code: 'const d = "Quality trading signals from certified experts and professionals.";',
          errors: [{ messageId: "claim" }],
        },
        {
          code: 'const FEATURES = ["Verified Experts", "Quality Signals"];',
          errors: [{ messageId: "claim" }, { messageId: "claim" }],
        },

        // --- the shapes it would drift back in as -------------------------
        { code: 'const c = "Top-rated strategies this month";', errors: [{ messageId: "claim" }] },
        { code: 'const c = "A proven edge";', errors: [{ messageId: "claim" }] },
        { code: 'const c = "High-performing advisors";', errors: [{ messageId: "claim" }] },
        { code: 'const c = "This strategy outperforms the index";', errors: [{ messageId: "claim" }] },
        { code: 'const c = "Risk-free returns";', errors: [{ messageId: "claim" }] },
        { code: 'const c = "Trusted by traders";', errors: [{ messageId: "claim" }] },

        // Template literals and JSX text are copy too — a claim does not stop
        // being one because it was interpolated or written between tags.
        {
          code: "const c = `Verified ${count} times`;",
          errors: [{ messageId: "claim" }],
        },
        {
          code: "const el = <p>Our certified analysts</p>;",
          errors: [{ messageId: "claim" }],
        },
      ],
    });
  });
});
