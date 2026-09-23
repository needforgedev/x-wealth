import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { strategies, strategyVersions } from "@/db/schema";

/**
 * The newest version of a strategy, scoped to its owner.
 *
 * Ownership is in the WHERE clause rather than checked afterwards, and the
 * owner id comes from the session rather than from an argument on the wire
 * (§8.5 — strategies are private to their author). A query that fetched first
 * and compared second would still be correct today and would stop being correct
 * the first time someone added an early return.
 */
export async function headVersionFor(input: {
  strategyId: string;
  userId: string;
}): Promise<{ id: string; versionNo: number; definition: unknown } | null> {
  const [row] = await db()
    .select({
      id: strategyVersions.id,
      versionNo: strategyVersions.versionNo,
      definition: strategyVersions.definition,
    })
    .from(strategyVersions)
    .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
    .where(and(eq(strategies.id, input.strategyId), eq(strategies.userId, input.userId)))
    .orderBy(desc(strategyVersions.versionNo))
    .limit(1);

  return row ?? null;
}
