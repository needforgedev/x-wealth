import { boolean, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, type CritiqueFindings } from "./_shared";
import { strategyVersions } from "./strategies";
import { forwardTests } from "./testing";

/**
 * APPEND ONLY.
 *
 * Every AI call is persisted: what went in, what came out, when, and whether
 * the advisor subsequently changed anything. **This log is the evidence that
 * the human authored the strategy and we did not** (`x-wealth-product.md`
 * §5.7). If SEBI ever asks who wrote the recommendation, this table is the
 * answer.
 *
 * Note what is absent and must stay absent: there is no column here that a
 * critique could write back into a strategy definition. The AI critiques; the
 * human decides. That is a legal boundary, not a design preference — the
 * moment our model reshapes a strategy we become a co-author of the investment
 * recommendation.
 *
 * `resulting_version_id` records what the *advisor* chose to author afterwards.
 * It is set by the advisor's action, never by the model.
 */
export const aiCritiques = pgTable(
  "ai_critiques",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    forwardTestId: uuid("forward_test_id")
      .notNull()
      .references(() => forwardTests.id, { onDelete: "restrict" }),

    /** Exactly what the model was shown. */
    inputSnapshot: jsonb("input_snapshot").notNull(),

    /** Structured findings, never a prose verdict. */
    findings: jsonb("findings").$type<CritiqueFindings>().notNull(),

    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),

    advisorActed: boolean("advisor_acted").notNull().default(false),
    resultingVersionId: uuid("resulting_version_id").references(() => strategyVersions.id),

    createdAt: createdAt(),
  },
  (t) => [index("ai_critiques_forward_test_id_idx").on(t.forwardTestId)],
);
