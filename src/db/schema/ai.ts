import { boolean, index, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, type AiOutput } from "./_shared";
import { strategyVersions } from "./strategies";
import { forwardTests } from "./testing";
import { users } from "./users";

/**
 * Which AI surface a call came from — one value per module in `CLAUDE.md` §7.
 *
 * v1 had exactly one, deferred as optional. v2 has five, and the AI is the
 * front door rather than a side panel: it compiles the idea (§7.3), sharpens
 * the hypothesis (§7.2), attacks the backtest (§7.7), writes the post-mortem
 * (§7.11) and generates the digests (§7.13).
 */
export const aiInteractionContext = pgEnum("ai_interaction_context", [
  "HYPOTHESIS",
  "COMPILE",
  "CRITIQUE",
  "POST_MORTEM",
  "DIGEST",
]);

/**
 * APPEND ONLY. Every AI call, before its output is shown to anyone.
 *
 * Replaced `ai_critiques` in migration `0013` (decision `AD-20`). The old table
 * anchored every row to a forward test, which is the one thing four of the five
 * context types do not have.
 *
 * ## What this log is for
 *
 * **It is the evidence that the human authored the strategy and we did not.**
 * `CLAUDE.md` §3 fact 2, and Reg 16C behind it. If a regulator ever asks who
 * wrote a rule set, this table is the answer — model output on one side, a
 * human decision on the other, with a timestamp between them.
 *
 * That is why `src/server/ai/interaction.ts` will not hand a caller the output
 * until the row is committed. A call whose log failed to write is a call that
 * did not happen, and nothing downstream is allowed to have seen it.
 *
 * ## What is absent, and must stay absent
 *
 * **No column through which model output could reach a strategy definition.**
 * §8.6 makes that a legal boundary, not a preference: the moment our model
 * reshapes a strategy we are a co-author of the investment recommendation, and
 * the claim above stops being true. The AI critiques; the human decides.
 *
 * `resultingVersionId` points at what the *user* chose to author afterwards. It
 * is set by their action, and the version it names was accepted by
 * `strategy_versions` on its own terms — six mandatory components, CHECK and
 * all. Nothing here can shortcut that.
 *
 * **No score, grade, rating or verdict column** (§8.7). Findings are
 * observations with evidence attached; "this strategy is weak" is not a shape
 * this table can store.
 */
export const aiInteractions = pgTable(
  "ai_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    contextType: aiInteractionContext("context_type").notNull(),

    /** Exactly what the model was shown. */
    inputSnapshot: jsonb("input_snapshot").notNull(),

    /** Exactly what it returned. Structured output, never a prose verdict. */
    output: jsonb("output").$type<AiOutput>().notNull(),

    /**
     * Which model, under which prompt. Without both, a finding cannot be
     * attributed to a model we have since replaced, and the log stops being
     * evidence of anything in particular.
     */
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),

    /**
     * What the call was about, where that is a row in this database.
     *
     * Nullable, and the migration's CHECKs say when each is required and when
     * it is forbidden: a HYPOTHESIS may name neither (§7.2 — a hypothesis
     * written against a strategy you already backtested is a rationalisation),
     * a DIGEST is account-wide, and a POST_MORTEM must name its test or there
     * is nothing to explain.
     */
    strategyVersionId: uuid("strategy_version_id").references(() => strategyVersions.id, {
      onDelete: "restrict",
    }),
    forwardTestId: uuid("forward_test_id").references(() => forwardTests.id, {
      onDelete: "restrict",
    }),

    /** Set once, afterwards, by the user's own action. Never by the model. */
    userActed: boolean("user_acted").notNull().default(false),
    resultingVersionId: uuid("resulting_version_id").references(() => strategyVersions.id, {
      onDelete: "restrict",
    }),

    createdAt: createdAt(),
  },
  (t) => [
    index("ai_interactions_user_id_idx").on(t.userId, t.createdAt),
    index("ai_interactions_strategy_version_idx").on(t.strategyVersionId),
    index("ai_interactions_forward_test_idx").on(t.forwardTestId),
  ],
);

export type AiInteraction = typeof aiInteractions.$inferSelect;
export type AiInteractionContext = (typeof aiInteractionContext.enumValues)[number];
