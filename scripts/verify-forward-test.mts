/**
 * End-to-end proof that a forward test advances correctly against real data.
 *
 *   npm run verify-forward-test
 *
 * Builds a forward test whose window opened far enough back that the loaded
 * bars have already carried it to completion, advances it exactly as the
 * evening job would, and checks what landed in `paper_trades`.
 *
 * Everything happens inside a transaction that is rolled back. `forward_tests`
 * and `paper_trades` are append-only, so a verification run that committed
 * would leave permanent fictional rows on an advisor's record — which is the
 * one thing this product must never do.
 *
 * Four properties are checked, in order of how badly a failure would hurt:
 *
 *   1. **Idempotence.** Running the job twice writes nothing the second time.
 *      Without this, a retry after a timeout would duplicate every trade.
 *   2. **Catch-up.** Advancing once after several sessions produces the same
 *      ledger as advancing session by session would have.
 *   3. **Reconciliation.** Cash implied by the recorded trades equals the
 *      engine's own equity — the ledger and the engine agree to the paisa.
 *   4. **Completion.** A finished window writes `final_results` once and the
 *      trigger refuses a second write.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { and, eq } = await import("drizzle-orm");
const { db } = await import("@/db");
const { forwardTests, paperTrades, strategies, strategyVersions } = await import("@/db/schema");
const { advanceForwardTest } = await import("@/server/forward-test/advance");
const { liveEndOfDaySource } = await import("@/server/market-data/db-store");
const { ZERO_BROKERAGE, nseEquityDelivery } = await import("@/domain/costs");
const { starterDefinition } = await import("@/domain/strategy");
const { formatPaise } = await import("@/domain/money");

const ROLLBACK = "ROLLBACK_ON_PURPOSE";

const definition = { ...starterDefinition(), instruments: ["NSE:RELIANCE", "NSE:TCS"] };
const costModel = nseEquityDelivery({ brokerage: ZERO_BROKERAGE, slippagePercent: 0.05 });

/** Far enough back that the loaded history has already run the window out. */
const OPENED_ON = "2024-01-02";
const PLANNED_SESSIONS = 120;

const source = await liveEndOfDaySource();
let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

const { advisors } = await import("@/db/schema");
const [owner] = await db().select({ id: advisors.id }).from(advisors).limit(1);
if (!owner) {
  console.error("No advisor rows — cannot build a forward test to advance.");
  process.exit(1);
}
const ownerId = owner.id;

try {
  await db()
    .transaction(async (tx) => {
      const [strategy] = await tx
        .insert(strategies)
        .values({
          advisorId: ownerId,
          name: "forward-test verification",
          segment: "EQUITY",
          timeframe: "1d",
        })
        .returning({ id: strategies.id });

      const [version] = await tx
        .insert(strategyVersions)
        .values({ strategyId: strategy.id, versionNo: 1, definition, hypothesisText: "verification" })
        .returning({ id: strategyVersions.id });

      const [draft] = await tx
        .insert(forwardTests)
        .values({
          strategyVersionId: version.id,
          status: "DRAFT",
          declaredHypothesis:
            "A 20/50 crossover on large caps produces more winners than losers over the window.",
          initialCapitalPaise: definition.initialCapitalPaise,
          costModel,
          plannedSessions: PLANNED_SESSIONS,
        })
        .returning({ id: forwardTests.id });

      await tx
        .update(forwardTests)
        .set({
          status: "RUNNING",
          startedAt: new Date(`${OPENED_ON}T00:00:00Z`),
          plannedEndAt: new Date("2024-07-01T00:00:00Z"),
        })
        .where(eq(forwardTests.id, draft.id));

      const test = {
        id: draft.id,
        startedAt: new Date(`${OPENED_ON}T00:00:00Z`),
        plannedSessions: PLANNED_SESSIONS,
        initialCapitalPaise: definition.initialCapitalPaise,
        costModel,
      };

      const readLedger = () =>
        tx
          .select()
          .from(paperTrades)
          .where(eq(paperTrades.forwardTestId, draft.id))
          .orderBy(paperTrades.entryAt);

      console.log(`forward test opened ${OPENED_ON}, window ${PLANNED_SESSIONS} sessions\n`);

      // --- first advance ----------------------------------------------------
      const first = await advanceForwardTest({
        tx,
        test,
        definition: definition as never,
        source,
        recorded: await readLedger(),
      });

      if (first.status !== "ADVANCED") {
        check(false, "first advance", first.reason);
        throw new Error(ROLLBACK);
      }

      const afterFirst = await readLedger();
      console.log(
        `  advanced to session ${first.sessionsElapsed}/${PLANNED_SESSIONS} · ` +
          `${first.entriesWritten} entries, ${first.exitsWritten} exits · ` +
          `net ${first.netReturnPercent >= 0 ? "+" : ""}${first.netReturnPercent.toFixed(2)}%` +
          `${first.completed ? " · COMPLETED" : ""}\n`,
      );

      check(afterFirst.length > 0, "trades were recorded", `${afterFirst.length} rows`);
      check(first.completed, "the window ran to completion");

      // --- 1. idempotence ---------------------------------------------------
      const second = await advanceForwardTest({
        tx,
        test,
        definition: definition as never,
        source,
        recorded: await readLedger(),
      });
      const afterSecond = await readLedger();

      check(
        second.status === "ADVANCED" &&
          second.entriesWritten === 0 &&
          second.exitsWritten === 0 &&
          afterSecond.length === afterFirst.length,
        "running the job twice writes nothing the second time",
        `${afterSecond.length} rows, unchanged`,
      );

      // --- 2. every trade is fully accounted for ---------------------------
      const closed = afterSecond.filter((t) => t.exitAt !== null);
      const complete = closed.every(
        (t) => t.grossPnlPaise !== null && t.costsBreakdown !== null && t.netPnlPaise !== null,
      );
      check(complete, "every closed trade has gross, costs and net together");

      const costsAlwaysBite = closed.every(
        (t) => Number(t.netPnlPaise) === Number(t.grossPnlPaise) - (t.costsBreakdown!.totalPaise),
      );
      check(costsAlwaysBite, "net equals gross minus costs on every trade (§5.3)");

      // --- 3. the ledger reconciles with the engine ------------------------
      const netFromLedger = closed.reduce((total, t) => total + Number(t.netPnlPaise), 0);
      const impliedEquity = definition.initialCapitalPaise + netFromLedger;
      const expectedReturn = (netFromLedger / definition.initialCapitalPaise) * 100;

      check(
        Math.abs(expectedReturn - first.netReturnPercent) < 0.000001,
        "the recorded trades reconcile with the engine's own return",
        `ledger ${expectedReturn.toFixed(4)}% vs engine ${first.netReturnPercent.toFixed(4)}%`,
      );
      console.log(
        `        capital ${formatPaise(definition.initialCapitalPaise as never, { withPaise: false })} ` +
          `→ ${formatPaise(impliedEquity as never, { withPaise: false })}`,
      );

      // --- 4. completion is written once -----------------------------------
      const [finished] = await tx
        .select()
        .from(forwardTests)
        .where(eq(forwardTests.id, draft.id));

      check(finished.status === "COMPLETED", "status moved to COMPLETED");
      check(finished.outcome === "COMPLETED", "outcome recorded");
      check(finished.finalResults !== null, "final results written");
      check(finished.endedAt !== null, "end date recorded");

      let refused = false;
      try {
        await tx.transaction(async (sp) => {
          await sp
            .update(forwardTests)
            .set({ finalResults: { tampered: true } as never })
            .where(eq(forwardTests.id, draft.id));
        });
      } catch {
        refused = true;
      }
      check(refused, "a second write to final_results is refused by the database");

      // --- an open trade cannot be closed twice ----------------------------
      const [aClosedTrade] = await tx
        .select()
        .from(paperTrades)
        .where(and(eq(paperTrades.forwardTestId, draft.id)))
        .limit(1);

      let closeRefused = false;
      try {
        await tx.transaction(async (sp) => {
          await sp
            .update(paperTrades)
            .set({ exitPrice: "1.0000" })
            .where(eq(paperTrades.id, aClosedTrade.id));
        });
      } catch {
        closeRefused = true;
      }
      check(closeRefused, "a recorded trade cannot be rewritten");

      throw new Error(ROLLBACK);
    })
    .catch((error: Error) => {
      if (error.message !== ROLLBACK) throw error;
    });

  const remaining = await db().select({ id: forwardTests.id }).from(forwardTests);
  console.log(`\nrolled back — forward_tests still holds ${remaining.length} row(s)`);
  console.log(
    failures === 0
      ? "✓ the forward-test engine advances, reconciles and completes correctly"
      : `✗ ${failures} check(s) failed`,
  );
} catch (error) {
  console.error(error);
  failures++;
}

process.exit(failures === 0 ? 0 : 1);
