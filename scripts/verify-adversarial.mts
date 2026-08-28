/**
 * The adversarial suite against real Upstox bars. `plan.md` W18.
 *
 * Read-only. Nothing is written, nothing is rolled back because nothing is
 * started — this runs the attacks over loaded history and prints what they
 * find.
 *
 * ## Why this exists on top of the unit tests
 *
 * `adversarial.test.ts` proves the suite behaves correctly on designed series
 * where the answer is known. That is the right place for correctness, and the
 * wrong place for the question this script asks: **does the suite actually find
 * anything on a real strategy?**
 *
 * §7.7 is explicit that a suite mostly returning "looks fine" has been built
 * wrong. A suite whose thresholds are set so politely that live data never
 * trips them would pass every unit test in the file and be worthless. The only
 * way to know is to point it at real prices and read the output.
 *
 *   npm run verify-adversarial
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { attack, walkForward, costSensitivity, monteCarloTradeOrder, regimeSlices } = await import(
  "@/domain/adversarial"
);
const { runBacktest } = await import("@/domain/backtest");
const { ZERO_BROKERAGE, nseEquityDelivery } = await import("@/domain/costs");
const { formatPaise } = await import("@/domain/money");
const { starterDefinition } = await import("@/domain/strategy");
const { loadSeries } = await import("@/server/forward-test/replay");
const { liveEndOfDaySource } = await import("@/server/market-data/db-store");

type StrategyDefinitionV2 = import("@/domain/strategy").StrategyDefinitionV2;

/**
 * A perfectly ordinary momentum strategy — the kind a first-time user writes.
 *
 * Not chosen to fail. The point is to see what the suite says about something
 * unremarkable, because that is what it will mostly be given.
 */
const definition: StrategyDefinitionV2 = {
  ...starterDefinition(),
  universe: { instruments: ["NSE:RELIANCE", "NSE:TCS"], minAvgTurnoverPaise: null },
  entry: {
    left: { kind: "SMA", period: 20 },
    comparator: "CROSSES_ABOVE",
    right: { kind: "SMA", period: 50 },
  },
  exit: {
    left: { kind: "SMA", period: 20 },
    comparator: "CROSSES_BELOW",
    right: { kind: "SMA", period: 50 },
  },
  targetPercent: 12,
  stopLossPercent: 5,
  sizing: { kind: "RISK_PERCENT", riskPercent: 1 },
};

const costModel = nseEquityDelivery({ brokerage: ZERO_BROKERAGE, slippagePercent: 0.05 });

const source = await liveEndOfDaySource();
const series = await loadSeries(definition, source);
const input = { definition, series, costModel };

const base = runBacktest({ definition, series, costModel });

console.log(
  `\n${definition.universe.instruments.join(", ")} · ${base.periodStart} → ${base.periodEnd}`,
);
console.log(
  `  ${base.metrics.tradeCount} trades · net ${base.metrics.netReturnPercent.toFixed(2)}% ` +
    `(gross ${base.metrics.grossReturnPercent.toFixed(2)}%) · ` +
    `drawdown ${base.metrics.maxDrawdownPercent.toFixed(2)}% · ` +
    `expectancy ${formatPaise(base.metrics.expectancyPaise as never)}/trade\n`,
);

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

// --- each attack produces something legible ---------------------------------

console.log("attacks");

const windows = walkForward(input);
check(windows.length > 0, "walk-forward splits the history", `${windows.length} windows`);
for (const w of windows) {
  console.log(
    `        ${w.from} → ${w.to}  ${w.netReturnPercent.toFixed(2)}%  ${w.tradeCount} trades`,
  );
}

const slices = regimeSlices(base.trades, series);
check(slices.length > 0, "regime slicing attributes trades", `${slices.length} regimes`);
for (const s of slices) {
  console.log(
    `        ${s.regime.padEnd(18)} ${String(s.tradeCount).padStart(3)} trades  ` +
      `${formatPaise(s.netPnlPaise as never)}`,
  );
}

const mc = monteCarloTradeOrder({
  trades: base.trades,
  initialCapitalPaise: definition.initialCapitalPaise,
  observed: base.metrics,
});
if (mc) {
  check(true, "Monte Carlo reorders the trades", `${mc.iterations} paths`);
  console.log(
    `        every ordering ends at ${mc.netReturnPercent.toFixed(2)}% — reordering cannot move it`,
  );
  console.log(
    `        drawdown: observed ${mc.observedMaxDrawdownPercent.toFixed(2)}%  ` +
      `median ${mc.medianMaxDrawdownPercent.toFixed(2)}%  p95 ${mc.p95MaxDrawdownPercent.toFixed(2)}%  ` +
      `worst ${mc.worstMaxDrawdownPercent.toFixed(2)}%  ·  ` +
      `${mc.worseThanObservedPercent.toFixed(0)}% of orderings were worse`,
  );
  console.log(
    `        losing streak: observed ${mc.observedLongestLosingStreak}, p95 ${mc.p95LongestLosingStreak}`,
  );
  check(
    mc.medianMaxDrawdownPercent <= mc.p95MaxDrawdownPercent &&
      mc.p95MaxDrawdownPercent <= mc.worstMaxDrawdownPercent,
    "the drawdown percentiles are ordered",
  );
} else {
  check(false, "Monte Carlo reorders the trades", "too few trades — is the strategy trading?");
}

const costs = costSensitivity(input);
check(costs.steps.length > 0, "cost sensitivity escalates slippage");
console.log(
  `        breaks even at ${
    costs.breakEvenSlippagePercent === null
      ? "no tested slippage"
      : `${costs.breakEvenSlippagePercent}% slippage`
  } (run assumed ${costs.baseSlippagePercent}%)`,
);

// --- the report -------------------------------------------------------------

const report = attack(input);

console.log(`\nreport · ${report.suiteVersion} · seed ${report.seed}`);
check(report.attacksRun.length > 0, "attacks ran", report.attacksRun.join(", "));
for (const skipped of report.attacksSkipped) {
  console.log(`        skipped ${skipped.attack}: ${skipped.reason}`);
}

console.log("");
for (const finding of report.findings) {
  console.log(`  [${finding.severity.padEnd(6)}] ${finding.attack}`);
  console.log(`             ${finding.observation}`);
}

/**
 * The one assertion that matters, and the reason this script exists.
 *
 * §7.7: *the AI's job here is to break the strategy, not bless it — a suite
 * that mostly returns "looks fine" has been built wrong.* An ordinary momentum
 * strategy on five years of two large-caps has plenty wrong with it, starting
 * with a sample far below a hundred trades. If the suite finds nothing here,
 * its thresholds are set to flatter and every report it ever writes is worthless.
 */
console.log("");
check(
  report.findings.length > 0,
  "the suite found something wrong with an ordinary strategy",
  `${report.findings.length} findings`,
);
check(
  report.findings.every((f) => /\d/.test(f.observation)),
  "every finding carries its numbers",
);
check(
  report.findings.every(
    (f) => !/\b(weak|strong|bad|good|poor|excellent|promising|solid)\b/i.test(f.observation),
  ),
  "no finding grades the strategy (§8.7)",
);

// Reproducibility — the report is destined for an append-only table.
check(
  JSON.stringify(attack(input)) === JSON.stringify(report),
  "running the suite twice produces the same report",
);

console.log(
  failures === 0
    ? "\n✓ the adversarial suite runs on real bars and finds real problems"
    : `\n✗ ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
