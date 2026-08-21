"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { strategies, strategyVersions } from "@/db/schema";
import {
  definitionsDiffer,
  validateStrategyDefinition,
  type StrategyDefinition,
} from "@/domain/strategy";
import { loadCatalogue } from "@/server/market-data/catalogue";
import { NotAuthorisedError, requirePublishingRights } from "@/server/identity";
import type { ActionResult } from "@/server/actions/auth";

/**
 * Strategy authoring.
 *
 * Two invariants shape everything here:
 *
 * - **Authoring is gated on a live registration** (`x-wealth-product.md` §5.4),
 *   so every action goes through `requirePublishingRights()`.
 * - **`strategy_versions` is append-only** (§5.1). A revision inserts a new row
 *   pointing at its parent; nothing ever updates a version. The database
 *   enforces this with a trigger, so a mistake here fails loudly rather than
 *   quietly rewriting history.
 *
 * Both actions validate the definition against the live instrument catalogue,
 * not just against its own shape. The picker in the builder already restricts
 * the choice, but a Server Action runs as a POST against the page and is
 * reachable by anyone who can send that request — render-time gating is not a
 * security boundary. More practically: the catalogue changes when the loader
 * runs, so a definition that was valid when the form was rendered may not be
 * by the time it is submitted.
 */

export async function createStrategy(input: {
  name: string;
  description: string;
  hypothesis: string;
  definition: StrategyDefinition;
}): Promise<ActionResult<{ strategyId: string }>> {
  const name = input.name.trim();
  const hypothesis = input.hypothesis.trim();

  if (name.length < 3) return { ok: false, error: "Give the strategy a name." };
  if (hypothesis.length < 10) {
    return {
      ok: false,
      error: "Write the hypothesis you are going to test. It is recorded before any result.",
    };
  }

  try {
    const { advisor } = await requirePublishingRights();

    const issues = validateStrategyDefinition(input.definition, await loadCatalogue());
    if (issues.length > 0) return { ok: false, error: issues[0].message };

    const strategyId = await db().transaction(async (tx) => {
      const [strategy] = await tx
        .insert(strategies)
        .values({
          advisorId: advisor.id,
          name,
          description: input.description.trim() || null,
          segment: "EQUITY",
          timeframe: input.definition.timeframe,
        })
        .returning({ id: strategies.id });

      const [version] = await tx
        .insert(strategyVersions)
        .values({
          strategyId: strategy.id,
          versionNo: 1,
          definition: input.definition,
          hypothesisText: hypothesis,
          parentVersionId: null,
        })
        .returning({ id: strategyVersions.id });

      // `strategies` is not append-only; moving the head pointer is allowed and
      // does not rewrite anything.
      await tx
        .update(strategies)
        .set({ currentVersionId: version.id, updatedAt: new Date() })
        .where(eq(strategies.id, strategy.id));

      return strategy.id;
    });

    revalidatePath("/advisor/home");
    return { ok: true, data: { strategyId } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/**
 * A revision is a new version, and the old one stays forever.
 *
 * This is the iteration ledger being written (PRD §5.6). Nothing here can hide
 * or amend a previous version, which is the entire point.
 */
export async function reviseStrategy(input: {
  strategyId: string;
  hypothesis: string;
  changeNote: string;
  definition: StrategyDefinition;
}): Promise<ActionResult<{ versionId: string; versionNo: number }>> {
  const hypothesis = input.hypothesis.trim();
  if (hypothesis.length < 10) return { ok: false, error: "Write the hypothesis for this version." };

  try {
    const { advisor } = await requirePublishingRights();

    const issues = validateStrategyDefinition(input.definition, await loadCatalogue());
    if (issues.length > 0) return { ok: false, error: issues[0].message };

    const result = await db().transaction(async (tx) => {
      const [strategy] = await tx
        .select()
        .from(strategies)
        .where(and(eq(strategies.id, input.strategyId), eq(strategies.advisorId, advisor.id)))
        .limit(1);
      if (!strategy) throw new NotAuthorisedError("No such strategy.");

      const existing = await tx
        .select()
        .from(strategyVersions)
        .where(eq(strategyVersions.strategyId, strategy.id))
        .orderBy(asc(strategyVersions.versionNo));

      const head = existing.at(-1);
      if (head && !definitionsDiffer(head.definition as StrategyDefinition, input.definition)) {
        // Recording an identical version would pad the ledger and make the
        // published-to-abandoned ratio meaningless.
        throw new NotAuthorisedError("Nothing changed — adjust the rules before saving a version.");
      }

      const [version] = await tx
        .insert(strategyVersions)
        .values({
          strategyId: strategy.id,
          versionNo: (head?.versionNo ?? 0) + 1,
          definition: input.definition,
          hypothesisText: hypothesis,
          parentVersionId: head?.id ?? null,
        })
        .returning({ id: strategyVersions.id, versionNo: strategyVersions.versionNo });

      await tx
        .update(strategies)
        .set({ currentVersionId: version.id, updatedAt: new Date() })
        .where(eq(strategies.id, strategy.id));

      return version;
    });

    revalidatePath(`/advisor/strategies/${input.strategyId}`);
    revalidatePath("/advisor/home");
    return { ok: true, data: { versionId: result.id, versionNo: result.versionNo } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

function messageFor(error: unknown): string {
  if (error instanceof NotAuthorisedError) return error.message;

  const message = error instanceof Error ? error.message : "";
  if (message.includes("append-only")) {
    // The trigger fired. That is a bug in this file, not user error.
    console.error("[strategy] attempted to mutate an append-only row", error);
    return "That change would rewrite a recorded version, which is not allowed.";
  }
  if (message.includes("strategy_versions_strategy_id_version_no_key")) {
    return "Someone saved a version at the same moment. Try again.";
  }

  console.error("[strategy] action failed", error);
  return "Something went wrong. Try again.";
}

/** Reads used by the advisor screens. */
export async function listStrategies(): Promise<
  ActionResult<Array<{ id: string; name: string; description: string | null; versionCount: number; updatedAt: Date }>>
> {
  try {
    const { advisor } = await requirePublishingRights();
    const rows = await db()
      .select({
        id: strategies.id,
        name: strategies.name,
        description: strategies.description,
        updatedAt: strategies.updatedAt,
        versionCount: sql<number>`(
          select count(*)::int from ${strategyVersions}
          where ${strategyVersions.strategyId} = ${strategies.id}
        )`,
      })
      .from(strategies)
      .where(eq(strategies.advisorId, advisor.id))
      .orderBy(strategies.updatedAt);

    return { ok: true, data: rows.reverse() };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
