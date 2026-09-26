import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { annotations, forwardTests, paperTrades, strategies, strategyVersions } from "@/db/schema";
import type { AnnotationTarget } from "@/domain/annotation";

/**
 * Reads for the annotation layer. Plain async functions, no `"use server"` —
 * the same reasoning as every other file in this directory.
 *
 * ## The whole chain comes back, oldest first
 *
 * §8.8: editing appends, nothing is overwritten — so a superseded note is not
 * a deleted note, it is an earlier belief, and the screen renders it muted
 * rather than pretending it never existed. No filter exists here for the same
 * reason the ledger has none (W8): the layer's honesty *is* the feature, and
 * a read that could drop the awkward rows would quietly become one that does.
 */
export async function annotationsForTarget(input: {
  targetType: AnnotationTarget;
  targetId: string;
  userId: string;
}) {
  return db()
    .select()
    .from(annotations)
    .where(
      and(
        eq(annotations.targetType, input.targetType),
        eq(annotations.targetId, input.targetId),
        // §8.5 — a note is as private as the strategy it sits beside.
        eq(annotations.userId, input.userId),
      ),
    )
    .orderBy(asc(annotations.createdAt));
}

/**
 * Whether the target row belongs to this user. One query per target type,
 * ownership expressed in the WHERE clause as always — a row that is not
 * yours is not found, rather than found and refused.
 *
 * This is the app-layer half of the integrity story: migration `0017`'s
 * trigger proves the target exists and keeps supersede chains inside one
 * record, and this keeps a note from being pinned to somebody else's row.
 */
export async function ownsAnnotationTarget(input: {
  targetType: AnnotationTarget;
  targetId: string;
  userId: string;
}): Promise<boolean> {
  const { targetType, targetId, userId } = input;

  if (targetType === "STRATEGY_VERSION") {
    const [row] = await db()
      .select({ id: strategyVersions.id })
      .from(strategyVersions)
      .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
      .where(and(eq(strategyVersions.id, targetId), eq(strategies.userId, userId)))
      .limit(1);
    return Boolean(row);
  }

  if (targetType === "FORWARD_TEST") {
    const [row] = await db()
      .select({ id: forwardTests.id })
      .from(forwardTests)
      .innerJoin(strategyVersions, eq(strategyVersions.id, forwardTests.strategyVersionId))
      .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
      .where(and(eq(forwardTests.id, targetId), eq(strategies.userId, userId)))
      .limit(1);
    return Boolean(row);
  }

  const [row] = await db()
    .select({ id: paperTrades.id })
    .from(paperTrades)
    .innerJoin(forwardTests, eq(forwardTests.id, paperTrades.forwardTestId))
    .innerJoin(strategyVersions, eq(strategyVersions.id, forwardTests.strategyVersionId))
    .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
    .where(and(eq(paperTrades.id, targetId), eq(strategies.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Every note on any of the given rows, oldest first — one query for a screen
 * that shows a record and its parts (a test and its trades, a strategy and
 * its versions).
 */
export async function annotationsForTargets(userId: string, targetIds: readonly string[]) {
  if (targetIds.length === 0) return [];
  return db()
    .select()
    .from(annotations)
    .where(and(eq(annotations.userId, userId), inArray(annotations.targetId, [...targetIds])))
    .orderBy(asc(annotations.createdAt));
}
