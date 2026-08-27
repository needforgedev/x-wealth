/**
 * Advance every running forward test by whatever sessions have printed.
 *
 *   npm run advance-forward-tests            # write
 *   npm run advance-forward-tests -- --dry   # report only, touch nothing
 *
 * Runs after the market-data loader, once an evening. `plan.md` W6-04.
 *
 * ## It replays; it does not step
 *
 * Each test is re-run from the session its window opened on, then the result is
 * compared against `paper_trades` and only the difference is written. There is
 * no stored position, no running cash balance, no "last processed date".
 *
 * That makes three otherwise-hard problems disappear:
 *
 *   - **Missing an evening is survivable.** The next run sees more sessions
 *     than are recorded and covers the gap in order. Nothing is skipped.
 *   - **Running twice is a no-op.** The replay is a pure function of frozen
 *     parameters and immutable bars, so the second diff comes back empty. That
 *     is what makes a retry safe against append-only tables.
 *   - **The ledger cannot drift.** It is checked against the replay every
 *     single evening, and a disagreement stops that test rather than compounding.
 *
 * Nothing here can edit a running test's parameters — the database refuses, and
 * `npm run verify-freeze` proves it. This job only appends trades and, once the
 * window has run its length, writes the final result exactly once.
 *
 * The work itself is in `src/server/forward-test/advance.ts`, so it can be run
 * against a transaction that is rolled back. See `npm run verify-forward-test`.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { db } = await import("@/db");
const { advanceForwardTest } = await import("@/server/forward-test/advance");
const { liveEndOfDaySource } = await import("@/server/market-data/db-store");
const { listRunningForwardTests, tradesForForwardTest } = await import(
  "@/server/queries/forward-test"
);

const dryRun = process.argv.includes("--dry");

const running = await listRunningForwardTests();
console.log(
  `${running.length} running forward test${running.length === 1 ? "" : "s"}` +
    `${dryRun ? "  (dry run — nothing will be written)" : ""}\n`,
);

if (running.length === 0) process.exit(0);

const source = await liveEndOfDaySource();
let wrote = 0;
let completed = 0;
let halted = 0;

for (const row of running) {
  const label = `${row.strategyName} v${row.versionNo}`;

  try {
    const recorded = await tradesForForwardTest(row.test.id);

    // One transaction per test. A test that fails leaves the others alone —
    // they are independent, and a shared transaction would roll back work that
    // was perfectly good.
    const result = await db().transaction((tx) =>
      advanceForwardTest({
        tx,
        test: row.test,
        definition: row.definition as never,
        source,
        recorded,
        dryRun,
      }),
    );

    if (result.status === "PENDING") {
      // Normal on the day a test is created: the window opens on the next
      // session. Not counted as halted — nothing is wrong.
      console.log(`  ${label}: window opens on the first session after ${result.startedOn}`);
      continue;
    }

    if (result.status === "HALTED") {
      halted++;
      console.log(`  ${label}: HALTED — ${result.reason} (${result.unexplained})`);
      continue;
    }

    const sessions = `session ${result.sessionsElapsed}/${row.test.plannedSessions}`;
    const net = result.netReturnPercent;
    const changed = result.entriesWritten + result.exitsWritten;
    wrote += changed;
    if (result.completed) completed++;

    if (changed === 0 && !result.completed) {
      console.log(`  ${label}: ${sessions}, nothing to record`);
      continue;
    }

    console.log(
      `  ${label}: ${sessions} · ${dryRun ? "would write " : ""}` +
        `+${result.entriesWritten} entries, +${result.exitsWritten} exits · ` +
        `net ${net >= 0 ? "+" : ""}${net.toFixed(2)}%` +
        `${result.completed ? (dryRun ? " · would COMPLETE" : " → COMPLETED") : ""}`,
    );
  } catch (error) {
    halted++;
    console.log(`  ${label}: FAILED — ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(
  `\n${wrote} trade row(s) ${dryRun ? "would be " : ""}written · ` +
    `${completed} test(s) completed${halted > 0 ? ` · ${halted} halted` : ""}`,
);

// A halted test is not a success. Exiting non-zero so a scheduled run surfaces
// rather than logging a problem into a stream nobody reads.
process.exit(halted > 0 ? 1 : 0);
