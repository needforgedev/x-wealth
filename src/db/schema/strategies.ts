import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  createdAt,
  marketSegment,
  timestampTz,
  type StrategyDefinition,
} from "./_shared";
import { advisors } from "./advisors";

/**
 * A strategy is the mutable container. Its *content* lives in
 * `strategy_versions`, which is append-only — so the record of what was
 * actually tested can never be rewritten.
 */
export const strategies = pgTable(
  "strategies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advisorId: uuid("advisor_id")
      .notNull()
      .references(() => advisors.id, { onDelete: "restrict" }),

    name: text("name").notNull(),
    description: text("description"),
    segment: marketSegment("segment").notNull(),
    timeframe: text("timeframe").notNull(),

    /**
     * Pointer to the head version. Mutable — moving the head does not and
     * cannot rewrite history. The FK is added in the constraints migration
     * because the two tables reference each other.
     */
    currentVersionId: uuid("current_version_id"),

    createdAt: createdAt(),
    updatedAt: timestampTz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("strategies_advisor_id_idx").on(t.advisorId)],
);

/**
 * APPEND ONLY (`x-wealth-product.md` §5.1).
 *
 * No UPDATE, no DELETE, no soft-delete. Corrections happen by appending a new
 * version that points at its parent. Enforced by trigger and by revoked grants
 * — see `drizzle/9000_append_only_constraints.sql`.
 */
export const strategyVersions = pgTable(
  "strategy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "restrict" }),

    versionNo: integer("version_no").notNull(),

    /** Structured data, never code (`x-wealth-product.md` §6). */
    definition: jsonb("definition").$type<StrategyDefinition>().notNull(),

    /**
     * Declared before the forward-test window opens. Declaring the hypothesis
     * up front is what stops the retry loop — if you can iterate until
     * something passes, you are selecting on noise (PRD §4).
     */
    hypothesisText: text("hypothesis_text"),

    /** Lineage. The iteration ledger walks this chain. */
    parentVersionId: uuid("parent_version_id"),

    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("strategy_versions_strategy_id_version_no_key").on(t.strategyId, t.versionNo),
    index("strategy_versions_parent_idx").on(t.parentVersionId),
  ],
);
