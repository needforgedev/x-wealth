import { index, pgEnum, pgTable, text, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

import { ANNOTATION_REASONS, ANNOTATION_TARGETS } from "../../domain/annotation";
import { createdAt } from "./_shared";
import { users } from "./users";

/**
 * APPEND ONLY, with no permitted mutation at all.
 *
 * `CLAUDE.md` §7.5 and §8.8: the record tables state what happened; an
 * annotation states why, in the author's words, at the time — and it never
 * alters the fact it sits beside. Editing appends a new row that names what
 * it supersedes. Nothing is updated, nothing is deleted, and a superseded
 * note stays readable, because "what did I believe before I revised this"
 * is itself part of the record.
 *
 * ## The enums live in `src/domain/annotation.ts`
 *
 * Imported rather than restated, so the reason list W21 will aggregate over
 * and the reason list the database accepts cannot drift apart. A test pins
 * them to migration `0017`'s SQL as well.
 *
 * ## `target_id` is deliberately not a foreign key
 *
 * The target is polymorphic — a version, a test, a trade, and later a signal
 * (§7.5 names four; the fourth's table does not exist yet). Existence is
 * checked by a BEFORE INSERT trigger in `0017`, ownership by the action; a
 * real FK per type would mean one nullable column per target, which is the
 * shape `ai_critiques` died of (AD-20).
 */

export const annotationTargetType = pgEnum("annotation_target_type", [...ANNOTATION_TARGETS]);
export const annotationReason = pgEnum("annotation_reason", [...ANNOTATION_REASONS]);

export const annotations = pgTable(
  "annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    targetType: annotationTargetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),

    structuredReason: annotationReason("structured_reason").notNull(),
    /** May be empty only where the structured reason stands on its own — see 0017's CHECK. */
    noteText: text("note_text").notNull(),

    /**
     * The row this one replaces. The chain is kept linear by a unique index —
     * one successor per note — so "the current note" is a fact, not a merge.
     */
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => annotations.id, {
      onDelete: "restrict",
    }),

    createdAt: createdAt(),
  },
  (t) => [
    index("annotations_target_idx").on(t.targetType, t.targetId, t.createdAt),
    index("annotations_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("annotations_single_successor_idx").on(t.supersedesId),
  ],
);

export type Annotation = typeof annotations.$inferSelect;
