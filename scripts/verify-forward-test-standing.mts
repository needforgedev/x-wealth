/**
 * End-to-end proof that the live console's figures are net of every charge.
 *
 *   npm run verify-standing
 *
 * `plan.md` W6-07. Read-only — it inserts nothing and opens no transaction,
 * because everything it checks is a pure function of frozen parameters and
 * bars that are already loaded.
 *
 * ## The bug this exists to catch
 *
 * The equity curve values an open position at `qty × last close`. The buy
 * leg's charges came out of cash when the position opened; the sell leg's have
 * not come out of anything, because the position has not sold. So while a test
 * is still holding something, the curve — and every metric derived from it —
 * sits above what closing would actually realise, by exactly what the exit will
 * cost.
 *
 * A backtest never shows this: its final session force-closes everything, so
 * the last point has both legs paid. A running forward test shows it every
 * single day, on the screen an advisor reads to decide whether their hypothesis
 * is holding up. §5.3 says no figure in this system may be quoted without its
 * costs, and an unrealised gain that has skipped the exit charges is precisely
 * a gross figure wearing a plausible face.
 *
 * The unit tests in `src/domain/forward-test.test.ts` pin the arithmetic. This
 * runs the same claim against real NSE bars and real statutory rates, because
 * the last forward-test bug in this codebase — a completed window that kept
 * trading for two more years — passed every unit test and was caught only by an
 * end-to-end run.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { liveEndOfDaySource } = await import("@/server/market-data/db-store");
const { replayForwardTest } = await import("@/server/forward-test/replay");
const { ZERO_BROKERAGE, nseEquityDelivery } = await import("@/domain/costs");
const { starterDefinition } = await import("@/domain/strategy");
type StrategyDefinitionV2 = import("@/domain/strategy").StrategyDefinitionV2;
const { formatPaise, formatPrice, positionValue } = await import("@/domain/money");

/**
 * Note the shape. `starterDefinition()` returns a **V2** definition, where the
 * instrument list lives under `universe`. This script previously spread a
 * top-level `instruments` key over it — the V1 shape — which V2's
 * `resolveDefinition` does not read, so the universe resolved to empty, the
 * replay found no sessions, and the script died with `WINDOW_NOT_OPEN`.
 *
 * It broke when the definition moved to V2 (`W4-08`, 27 Aug 2026) and was
 * invisible because the value was passed on with `as never`, which switches off
 * exactly the check that would have caught it. The cast is gone.
 */
const definition: StrategyDefinitionV2 = {
  ...starterDefinition(),
  universe: { instruments: ["NSE:RELIANCE", "NSE:TCS"], minAvgTurnoverPaise: null },
};
const costModel = nseEquityDelivery({ brokerage: ZERO_BROKERAGE, slippagePercent: 0.05 });

/** Opened long ago, with a window far too long to have closed — still running. */
const OPENED_ON = "2024-01-02";
const PLANNED_SESSIONS = 5_000;

let failures = 0;
let skipped = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};
const skip = (label: string, why: string) => {
  skipped++;
  console.log(`  SKIP  ${label}  ${why}`);
};

const progress = await replayForwardTest({
  startedOn: OPENED_ON,
  plannedSessions: PLANNED_SESSIONS,
  initialCapitalPaise: definition.initialCapitalPaise,
  costModel,
  definition,
  source: await liveEndOfDaySource(),
});

const s = progress.standing;

console.log(
  `window opened ${OPENED_ON} · session ${s.sessionsElapsed}/${PLANNED_SESSIONS} · ` +
    `latest priced ${s.lastSessionDate}\n`,
);
console.log(
  `  ${s.closedTradeCount} closed, ${s.openPositionCount} open · ` +
    `settled ${formatPaise(s.realisedNetPnlPaise as never)} · ` +
    `marked ${formatPaise(s.unrealisedNetPnlPaise as never)}\n`,
);

check(!s.isComplete, "a 5,000-session window is still open");

// --- the identity every figure on the console rests on ----------------------
check(
  s.markedEquityPaise - s.exitChargesOutstandingPaise ===
    definition.initialCapitalPaise + s.realisedNetPnlPaise + s.unrealisedNetPnlPaise,
  "marked equity accounts for exactly realised, marked and the unpaid exit",
  `${formatPaise(s.markedEquityPaise as never)} − ${formatPaise(s.exitChargesOutstandingPaise as never)}`,
);

check(
  s.realisedNetPnlPaise === progress.trades.reduce((sum, t) => sum + t.netPnlPaise, 0),
  "settled P&L is the sum of the closed round trips and nothing else",
);

check(
  s.equityPaise === s.markedEquityPaise - s.exitChargesOutstandingPaise,
  "the quoted equity is the marked one less the charges an exit has not paid",
);

// --- the point of the whole exercise ---------------------------------------
if (s.openPositionCount === 0) {
  // Not a pass. The assertions below have nothing to bite on, and reporting
  // them as green would say the exit-charge deduction was verified when the
  // run never exercised it.
  skip(
    "the exit charges an open mark has not paid",
    "no position is open at the latest bar, so there is nothing outstanding to deduct",
  );
  skip("the curve sits above the quoted figure", "same reason");
} else {
  check(
    s.exitChargesOutstandingPaise > 0,
    "an open position carries exit charges nobody has paid",
    formatPaise(s.exitChargesOutstandingPaise as never),
  );
  check(
    s.netReturnPercent < progress.metrics.netReturnPercent,
    "the quoted return is below the curve's own, because the curve has not paid them",
    `${s.netReturnPercent.toFixed(4)}% vs ${progress.metrics.netReturnPercent.toFixed(4)}%`,
  );

  for (const mark of s.openMarks) {
    // Via `positionValue`, not by hand: prices are ticks (1e-4 rupees) and P&L
    // is paise (1e-2), and getting that conversion backwards is how the first
    // draft of this check passed a bound four orders of magnitude too loose.
    const gross =
      positionValue(mark.markPrice, mark.qty) - positionValue(mark.entryPrice, mark.qty);
    check(
      mark.netPnlIfClosedPaise < gross,
      `${mark.symbol} marked net is below its price move`,
      `${formatPrice(mark.entryPrice)} → ${formatPrice(mark.markPrice)} × ${mark.qty} · ` +
        `gross ${formatPaise(gross as never)}, net ${formatPaise(mark.netPnlIfClosedPaise as never)}`,
    );
    check(
      mark.roomToStopPercent >= 0,
      `${mark.symbol} room to stop is never reported as negative headroom`,
      `${mark.roomToStopPercent.toFixed(1)}% above ${formatPrice(mark.stopPrice)}`,
    );
  }
}

// --- progress reporting ----------------------------------------------------
check(
  s.sessionsElapsed + s.sessionsRemaining === PLANNED_SESSIONS,
  "elapsed and remaining add up to the planned window",
);
check(
  s.percentComplete <= 100,
  "progress never exceeds a full window",
  `${s.percentComplete.toFixed(2)}%`,
);
check(
  s.lastSessionDate === progress.equityCurve.at(-1)?.date,
  "the standing dates itself from the last session priced, not from the clock",
);

console.log(
  failures === 0
    ? `\n✓ the live figures are net of every charge, including the ones an exit has not paid` +
        `${skipped > 0 ? ` (${skipped} check(s) skipped — see above)` : ""}`
    : `\n✗ ${failures} check(s) failed`,
);

process.exit(failures === 0 ? 0 : 1);
