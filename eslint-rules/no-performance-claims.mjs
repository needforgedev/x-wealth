/**
 * Refuse copy that characterises performance, or promises an audience.
 * `plan.md` W10-09.
 *
 * Two invariants, one mechanism, because both fail the same way — as prose, in
 * a file CI cannot otherwise read.
 *
 * `CLAUDE.md` §8.7: **no platform-authored performance claims.** No scoring, no
 * star ratings, no quality badges, no ranking by return. We report what
 * happened; we never grade it. §10 extends that to seed data and demo content.
 *
 * `CLAUDE.md` §8.5: **strategies are private to their author.** No sharing, no
 * publishing, no cross-user visibility. Copy promising a public profile is the
 * product advertising the one thing that would collapse the whole compliance
 * structure.
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

/**
 * Copy that tells a user their work reaches somebody else. `CLAUDE.md` §8.5.
 *
 * Added after the v2 audit found five screens still promising publication — the
 * abandon box said *"Published with the test, permanently, on your public
 * profile"*, the start box said *"stays on your public record"*, and the risk
 * disclosure, which is the one screen a user must tick to proceed, described
 * advisors as SEBI-registered Research Analysts. All of it survived the persona
 * migration for the same reason the §8.7 words did: nothing in CI reads prose.
 *
 * §8.5 is the single most load-bearing constraint in the product — the moment
 * one user can see another's strategy or signals we are publishing investment
 * recommendations. Copy asserting that is worse than a dead feature: it is the
 * product telling the user we do the prohibited thing, and a user who believes
 * it either expects an audience they will never get or declines to write down
 * a real reason because they think strangers will read it.
 *
 * **Phrases, not bare words.** `publish` alone would fail on Supabase's
 * "publishable key", `schemaFilter: ["public"]`, and "the AI layer's public
 * surface" — all correct uses. A rule that cries wolf on legitimate vocabulary
 * gets suppressed within a week and then protects nothing, which is the same
 * reasoning that kept `best` and `expert` off the list above.
 */
const PUBLICATION = [
  "public",
  "publicly",
  "publish(?:ed|es|ing)?",
  "leaderboard",
  "marketplace",
  "copy[- ]trad(?:e|es|ing)",
  "subscribers?",
  /**
   * The verb is required, because the sentence that states the guarantee —
   * *"nothing another user builds is shown to you"* — names the same nouns as
   * the sentence that breaks it. Flagging the denial alongside the promise is
   * how a rule earns a blanket suppression.
   */
  "(?:other|another) (?:user|trader|member)s? (?:can|will|could|may) see",
  "share (?:this|your) strateg(?:y|ies)",
];

/**
 * The uses of these words that are correct, each one real in this codebase.
 *
 * `public` is banned as prose because the copy that shipped said *"Permanent
 * and public."* — the word standing alone, not attached to "profile". Catching
 * that means catching the bare word, and catching the bare word means naming
 * the legitimate uses here rather than letting them fail the build.
 *
 * `publishable` is absent deliberately: `\bpublish(?:ed|es|ing)?\b` cannot
 * match inside it, because the `\b` fails against the following "a".
 */
const PUBLICATION_EXEMPT = [
  // `schemaFilter: ["public"]` — a Postgres schema name, and a lone word is
  // never a sentence.
  "^public$",
  // Ordinary engineering vocabulary, and NSE's own term for a closed session.
  "\\bpublic (?:surface|api|interface|schema|holiday|holidays)\\b",
];

const CLAIM_PATTERN = new RegExp(`\\b(${CLAIMS.join("|")})\\b`, "i");
const PUBLICATION_PATTERN = new RegExp(`\\b(${PUBLICATION.join("|")})\\b`, "i");
const PUBLICATION_EXEMPT_PATTERN = new RegExp(PUBLICATION_EXEMPT.join("|"), "i");

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
      publication:
        '"{{word}}" tells the user their work reaches someone else. CLAUDE.md §8.5: strategies ' +
        "are private to their author — there is no sharing, no publishing and no cross-user " +
        'visibility, so there is no audience for this to reach. Say "permanent" or "on your own ' +
        'record" if you mean it cannot be edited. If this use is genuinely factual, add it to ' +
        "the rule's `allow` list so the exemption is a decision on the record.",
    },
  },

  create(context) {
    const allow = new Set((context.options[0]?.allow ?? []).map((s) => s.toLowerCase()));

    const check = (node, raw) => {
      if (typeof raw !== "string") return;
      const text = raw.trim();
      if (!text || SCREAMING_SNAKE.test(text) || NOT_PROSE.test(text)) return;
      if (allow.has(text.toLowerCase())) return;

      const claim = CLAIM_PATTERN.exec(text);
      if (claim) {
        context.report({ node, messageId: "claim", data: { word: claim[1] } });
        return;
      }

      if (PUBLICATION_EXEMPT_PATTERN.test(text)) return;

      const publication = PUBLICATION_PATTERN.exec(text);
      if (publication) {
        context.report({ node, messageId: "publication", data: { word: publication[1] } });
      }
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
