"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { forwardTests, strategies, strategyVersions } from "@/db/schema";
import { ZERO_BROKERAGE, nseEquityDelivery } from "@/domain/costs";
import { DEFAULT_PLANNED_SESSIONS, SESSION_WINDOW } from "@/domain/forward-test";
import { PLACEHOLDER_CALENDAR_2026, addSessions } from "@/domain/session";
import { validateStrategyDefinition, type StrategyDefinition } from "@/domain/strategy";
import { toSymbol } from "@/domain/symbol";
import { loadCatalogue } from "@/server/market-data/catalogue";
import { liveEndOfDaySource } from "@/server/market-data/db-store";
import { NotAuthorisedError, requirePublishingRights } from "@/server/identity";
import type { ActionResult } from "@/server/actions/auth";

/**
 * Starting and stopping a forward test.
 *
 * This is `x-wealth-product.md` §5.2 at the application boundary. The database
 * already refuses to let a RUNNING test be edited — `npm run verify-freeze`
 * proves that with fourteen raw-SQL attacks — so nothing here is load-bearing
 * for the invariant. What these actions do is make sure the row that gets
 * frozen is the *right* row, and that the advisor knew what they were agreeing
 * to when it froze.
 *
 * Only the mutation lives here. Reads are in `src/server/queries/forward-test.ts`
 * for the same reason as the backtest ones: every export of a `"use server"`
 * file becomes a callable POST endpoint, so a read taking an advisor id as an
 * argument would be an access-control hole.
 */

const SLIPPAGE_PERCENT = 0.05;

/**
 * Declare a hypothesis, lock the parameters, open the window.
 *
 * Created as `DRAFT` and moved to `RUNNING` in the same transaction. There is
 * deliberately no screen where a test sits in `DRAFT` waiting to be started: a
 * draft that can be edited before it counts is a place to tune parameters while
 * watching the market, which is the exact behaviour the freeze exists to
 * prevent. The row is a draft only for the microseconds between two statements.
 */
export async function startForwardTest(input: {
  strategyVersionId: string;
  hypothesis: string;
  plannedSessions?: number;
}): Promise<ActionResult<{ forwardTestId: string }>> {
  const hypothesis = input.hypothesis.trim();

  // Longer than the strategy-level minimum on purpose. This is the sentence the
  // advisor is judged against months from now, and "it will go up" is not a
  // hypothesis anyone can be wrong about in an interesting way.
  if (hypothesis.length < 30) {
    return {
      ok: false,
      error:
        "Write the hypothesis you are testing — what you expect to happen, and roughly when. It is recorded before any result exists and cannot be edited afterwards.",
    };
  }

  const plannedSessions = input.plannedSessions ?? DEFAULT_PLANNED_SESSIONS;
  if (
    !Number.isInteger(plannedSessions) ||
    plannedSessions < SESSION_WINDOW.min ||
    plannedSessions > SESSION_WINDOW.max
  ) {
    return {
      ok: false,
      error: `The window must be between ${SESSION_WINDOW.min} and ${SESSION_WINDOW.max} trading sessions.`,
    };
  }

  try {
    const { advisor } = await requirePublishingRights();

    const [row] = await db()
      .select({
        versionId: strategyVersions.id,
        definition: strategyVersions.definition,
        strategyId: strategies.id,
        advisorId: strategies.advisorId,
      })
      .from(strategyVersions)
      .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
      .where(eq(strategyVersions.id, input.strategyVersionId))
      .limit(1);

    if (!row || row.advisorId !== advisor.id) {
      throw new NotAuthorisedError("No such strategy version.");
    }

    const definition = row.definition as StrategyDefinition;

    // Re-validated against the live catalogue. A version is immutable but the
    // loaded universe is not, and starting a 60-session window against an
    // instrument that has since been dropped would waste three months.
    const issues = validateStrategyDefinition(definition, await loadCatalogue());
    if (issues.length > 0) return { ok: false, error: issues[0].message };

    /**
     * The window opens on the *next* session, never on this one.
     *
     * Today's bar already exists by the time anyone is reading this — the
     * loader runs after the close. Opening the window on a session whose prices
     * are already known would let an advisor start a test having seen the first
     * day of it, which is precisely the lookahead the whole exercise is
     * arranged to prevent.
     */
    const source = await liveEndOfDaySource();
    const latestBar = await source.latestBar(toSymbol(definition.instruments[0]));
    if (!latestBar) {
      return { ok: false, error: "No price history is loaded for that instrument." };
    }

    const opensOn = addSessions(latestBar.date, 1, PLACEHOLDER_CALENDAR_2026);
    const estimatedEnd = addSessions(opensOn, plannedSessions - 1, PLACEHOLDER_CALENDAR_2026);

    const forwardTestId = await db().transaction(async (tx) => {
      const [draft] = await tx
        .insert(forwardTests)
        .values({
          strategyVersionId: row.versionId,
          status: "DRAFT",
          declaredHypothesis: hypothesis,
          initialCapitalPaise: definition.initialCapitalPaise,
          costModel: nseEquityDelivery({
            brokerage: ZERO_BROKERAGE,
            slippagePercent: SLIPPAGE_PERCENT,
          }),
          plannedSessions,
        })
        .returning({ id: forwardTests.id });

      // The freeze bites here. Everything above is settled from this statement
      // onward, and the trigger will refuse any later attempt to change it.
      await tx
        .update(forwardTests)
        .set({
          status: "RUNNING",
          startedAt: new Date(`${opensOn}T00:00:00Z`),
          plannedEndAt: new Date(`${estimatedEnd}T00:00:00Z`),
        })
        .where(eq(forwardTests.id, draft.id));

      return draft.id;
    });

    revalidatePath(`/advisor/strategies/${row.strategyId}`);
    return { ok: true, data: { forwardTestId } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/**
 * Stop a running test, permanently and visibly.
 *
 * Abandonment is a first-class outcome, not a failure state to be tidied away.
 * It stays on the advisor's public record with the reason they gave — that is
 * the denominator that makes a completed test mean anything (§5.2, PRD §5.6).
 *
 * The reason is required and the advisor is told it will be published, because
 * a reason nobody sees is not a reason, it is a note to self.
 */
export async function abandonForwardTest(input: {
  forwardTestId: string;
  reason: string;
}): Promise<ActionResult> {
  const reason = input.reason.trim();
  if (reason.length < 10) {
    return {
      ok: false,
      error: "Say why you are abandoning this test. It stays on your public record with the reason.",
    };
  }

  try {
    const { advisor } = await requirePublishingRights();

    const [row] = await db()
      .select({ id: forwardTests.id, status: forwardTests.status, strategyId: strategies.id })
      .from(forwardTests)
      .innerJoin(strategyVersions, eq(strategyVersions.id, forwardTests.strategyVersionId))
      .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
      .where(and(eq(forwardTests.id, input.forwardTestId), eq(strategies.advisorId, advisor.id)))
      .limit(1);

    if (!row) throw new NotAuthorisedError("No such forward test.");
    if (row.status !== "RUNNING" && row.status !== "DRAFT") {
      return { ok: false, error: "That test has already ended." };
    }

    await db()
      .update(forwardTests)
      .set({
        status: "ABANDONED",
        outcome: "ABANDONED",
        abandonReason: reason,
        endedAt: new Date(),
      })
      .where(eq(forwardTests.id, row.id));

    revalidatePath(`/advisor/forward-tests/${row.id}`);
    revalidatePath(`/advisor/strategies/${row.strategyId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

function messageFor(error: unknown): string {
  if (error instanceof NotAuthorisedError) return error.message;

  const message = error instanceof Error ? error.message : "";

  // The trigger fired. Every one of these is a bug in this file rather than
  // user error — the invariants are documented and the actions are written to
  // respect them — so the log matters more than the message.
  if (message.includes("frozen") || message.includes("append-only")) {
    console.error("[forward-test] attempted to mutate a frozen row", error);
    return "That change would rewrite a running test, which is not allowed. Abandon it and start a new one.";
  }
  if (message.includes("illegal status transition")) {
    console.error("[forward-test] illegal transition", error);
    return "That test is not in a state where this is possible.";
  }
  if (message.includes("daily_bars is empty")) {
    return "No price history is loaded yet. Run the market data loader first.";
  }

  console.error("[forward-test] action failed", error);
  return "Something went wrong. Try again.";
}
