/**
 * Refuse copy that characterises performance. `plan.md` W10-09.
 *
 * `CLAUDE.md` §8.7: **no platform-authored performance claims.** No scoring, no
 * star ratings, no quality badges, no ranking by return. We report what
 * happened; we never grade it. §10 extends that to seed data and demo content.
 *
 * ## Why a lint rule and not a code review
 *
 * The landing page kept "Verified Experts", "Quality Signals" and "certified
 * experts" through an entire persona migration — and `layout.tsx` kept
 * "Quality trading signals from certified experts" in the page description,
 * which is what a link preview shows. Typecheck, lint, build and 276 tests all
 * passed the whole time, because none of them can see prose. §8 is explicit
 * that an invariant relying on developer discipline eventually gets violated.
 *
 * ## What it checks, and what it deliberately does not
 *
 * String literals, template chunks and JSX text. **Not comments** — a comment
 * recording which words were removed and why is the opposite of a violation,
 * and every current mention in this codebase is exactly that.
 *
 * **Not model output.** A lint rule sees source, so it cannot catch a critique
 * that emits "this strategy is strong" at runtime. That needs a validator on
 * the structured output before it is stored or shown — a different guard for a
 * different problem, and W7's job.
 *
 * ## Words deliberately absent from the list
 *
 * **`best`** — "best bid" and "best ask" are the names of real order-book
 * levels. Banning it would fail on correct trading vocabulary.
 *
 * **`expert`** — `EXPERT` is a value of the `experience_level` enum, and
 * "Expert" is how a user describes themselves on the onboarding screen. That is
 * a self-report, not us grading anyone. The phrase that actually offended —
 * "certified experts" — is caught by `certified`.
 *
 * The list targets claims, not vocabulary. Anything on it that turns out to
 * have a legitimate use gets an entry in `allow`, which makes the exemption a
 * decision someone made rather than a word that quietly stopped being checked.
 */

/** Whole-word or whole-phrase, case-insensitive. */
const CLAIMS = [
  "verified",
  "certified",
  "guaranteed",
  "proven",
  "quality",
  "trusted",
  "elite",
  "top[- ]rated",
  "highly[- ]rated",
  "star[- ]rating",
  "high[- ]performing",
  "best[- ]performing",
  "top[- ]performing",
  "outperform(?:s|ed|ing)?",
  "market[- ]beating",
  "risk[- ]free",
];

const PATTERN = new RegExp(`\\b(${CLAIMS.join("|")})\\b`, "i");

/** Enum values and other SCREAMING_SNAKE constants are not prose. */
const SCREAMING_SNAKE = /^[A-Z][A-Z0-9_]*$/;

/** Module paths, file names and query fragments are not prose either. */
const NOT_PROSE = /^[@./]|\.(?:sql|ts|tsx|mjs|json|svg|png)$|^https?:/;

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Ban copy that characterises performance (CLAUDE.md §8.7)." },
    schema: [
      {
        type: "object",
        properties: { allow: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      claim:
        '"{{word}}" is a performance claim. CLAUDE.md §8.7: we report what happened and never ' +
        "characterise it. Say what the number is, not how good it is. If this use is genuinely " +
        "factual, add it to the rule's `allow` list so the exemption is a decision on the record.",
    },
  },

  create(context) {
    const allow = new Set((context.options[0]?.allow ?? []).map((s) => s.toLowerCase()));

    const check = (node, raw) => {
      if (typeof raw !== "string") return;
      const text = raw.trim();
      if (!text || SCREAMING_SNAKE.test(text) || NOT_PROSE.test(text)) return;
      if (allow.has(text.toLowerCase())) return;

      const found = PATTERN.exec(text);
      if (found) context.report({ node, messageId: "claim", data: { word: found[1] } });
    };

    return {
      Literal(node) {
        // An import path is not copy, and neither is anything else that only
        // names a module.
        const p = node.parent;
        if (p && (p.type === "ImportDeclaration" || p.type === "ExportNamedDeclaration")) return;
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};

export default rule;
