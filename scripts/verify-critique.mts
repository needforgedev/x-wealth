/**
 * W7-03…07 — does the critique hold up against a real model and a real run?
 *
 *   npm run verify-critique
 *
 * Unit tests prove the gate refuses what it must refuse. This asks what they
 * cannot: given a genuinely computed backtest and its genuinely computed
 * attack report, does the live model return an account that survives
 * `validateCritique`?
 *
 * Entirely in memory, like `verify-compile`: the engine and the adversarial
 * suite run over loaded history, the interaction log is a local object, and
 * nothing touches a table. What this therefore does not prove is the logging
 * spine — `interaction.test.ts` and `db:verify` already do.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { attack } = await import("@/domain/adversarial");
const { tunableParameters } = await import("@/domain/adversarial");
const { runBacktest } = await import("@/domain/backtest");
const { ZERO_BROKERAGE, nseEquityDelivery } = await import("@/domain/costs");
const {
  CRITIQUE_PROMPT_VERSION,
  buildCritiqueInput,
  validateCritique,
} = await import("@/domain/critique");
const { describeCondition, describeSizing, resolveDefinition, starterDefinition } =
  await import("@/domain/strategy");
const { runInteraction } = await import("@/server/ai/interaction");
const { loadSeries } = await import("@/server/forward-test/replay");
const { liveEndOfDaySource } = await import("@/server/market-data/db-store");

type StrategyDefinitionV2 = import("@/domain/strategy").StrategyDefinitionV2;

if (!process.env.OPENROUTER_API_KEY) {
  console.error(
    "OPENROUTER_API_KEY is not set in .env.local, so this would test the stub.\n" +
      "The gate only means something against answers nobody scripted.",
  );
  process.exit(1);
}

/** The same unremarkable strategy `verify-adversarial` uses, on purpose. */
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

const run = runBacktest({ definition, series, costModel });
const report = attack({ definition, series, costModel });

console.log(
  `\nrun: ${run.periodStart} → ${run.periodEnd} · ${run.metrics.tradeCount} trades · ` +
    `net ${run.metrics.netReturnPercent.toFixed(2)}% · attack findings ${report.findings.length}\n`,
);

const rules = resolveDefinition(definition);
const parameters = tunableParameters(definition).map((p) => ({ label: p.label, value: p.value }));

const facts = {
  backtestRunId: "00000000-0000-0000-0000-00000000dead",
  period: { start: run.periodStart, end: run.periodEnd },
  initialCapitalPaise: definition.initialCapitalPaise,
  rules: {
    entry: describeCondition(rules.entry),
    exit: describeCondition(rules.exit),
    stopLoss: `${rules.stopLossPercent}% below entry`,
    target: rules.targetPercent === null ? null : `${rules.targetPercent}% above entry`,
    sizing: describeSizing(rules.sizing),
    instruments: rules.instruments,
    timeframe: "DAILY",
  },
  parameters,
  parameterCount: parameters.length,
  results: {
    netReturnPercent: run.metrics.netReturnPercent,
    grossReturnPercent: run.metrics.grossReturnPercent,
    totalCostsPaise: run.metrics.totalCostsPaise,
    tradeCount: run.metrics.tradeCount,
    hitRatePercent: run.metrics.hitRatePercent,
    maxDrawdownPercent: run.metrics.maxDrawdownPercent,
    avgWinPaise: run.metrics.avgWinPaise,
    avgLossPaise: run.metrics.avgLossPaise,
    expectancyPaise: run.metrics.expectancyPaise,
    profitFactor: run.metrics.profitFactor,
    longestLosingStreak: run.metrics.longestLosingStreak,
    topTradeSharePercent: run.metrics.topTradeSharePercent,
    exposurePercent: run.metrics.exposurePercent,
    sampleAdequate: run.metrics.sampleAdequate,
  },
  costs: { segment: costModel.segment, slippagePercent: costModel.slippagePercent },
  attack: {
    suiteVersion: report.suiteVersion,
    findings: report.findings.map((f) => ({
      attack: f.attack,
      severity: f.severity,
      observation: f.observation,
    })),
    attacksRun: report.attacksRun,
    attacksSkipped: report.attacksSkipped,
  },
};

/** In memory. The point here is the model and the gate, not the log. */
const log = {
  async record() {
    return { id: "00000000-0000-0000-0000-000000000000", createdAt: new Date() };
  },
  async markActed() {
    return true;
  },
};

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

const logged = await runInteraction({
  userId: "00000000-0000-0000-0000-000000000000",
  contextType: "CRITIQUE",
  promptVersion: CRITIQUE_PROMPT_VERSION,
  input: buildCritiqueInput(facts),
  log,
});

console.log(`model: ${logged.modelId}\n`);

const gated = validateCritique(logged.output);
check(gated.status === "VALID", "the live answer passes the no-verdict gate");
if (gated.status !== "VALID") {
  for (const issue of gated.issues) console.log(`         ${issue.path}: ${issue.message}`);
  process.exit(1);
}

const view = gated.view;
check(view.findings.length >= 1, "at least one evidenced finding", `${view.findings.length}`);
check(
  !run.metrics.sampleAdequate
    ? view.findings.some((f) => /\d/.test(f.observation) && /trade/i.test(`${f.observation} ${f.evidence}`))
    : true,
  "an inadequate sample is named in the findings (§8.12)",
);

console.log();
for (const f of view.findings) {
  console.log(`  – ${f.observation}`);
  console.log(`    (${f.evidence})`);
}
if (view.withheldFindings > 0) {
  console.log(`  (${view.withheldFindings} withheld for carrying no figures)`);
}
console.log(`\n  ${view.summary}`);
for (const q of view.limits) console.log(`  limit: ${q}`);
console.log();

console.log(
  failures === 0
    ? "✓ the critique reads a real run, and the gate accepts what the model wrote"
    : `✗ ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
