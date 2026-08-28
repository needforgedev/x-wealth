import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { EquityCurve } from "@/components/advisor/EquityCurve";
import type { ExecutedTrade } from "@/domain/backtest";
import type { FillModel } from "@/domain/session-step";
import type { CostModel } from "@/domain/costs";
import type { RunMethodology } from "@/domain/methodology";
import { formatPaise, formatPrice, priceTicks } from "@/domain/money";
import { hasAcknowledgedRisk, nextPath } from "@/domain/onboarding";
import { describeCondition,
  describeSizing,
  resolveDefinition, type StrategyDefinition } from "@/domain/strategy";
import { currentIdentity } from "@/server/identity";
import { latestReportForRun } from "@/server/queries/adversarial";
import { loadRunForUser } from "@/server/queries/backtest";
import { RunAttack } from "./RunAttack";

export const dynamic = "force-dynamic";

/**
 * One backtest run, in full.
 *
 * The headline figure is net of costs, and gross is shown beside it rather
 * than instead of it — `CLAUDE.md` §8.3 requires both together so the drag is
 * visible as a gap. What does not exist anywhere is a gross figure *on its
 * own*, or a toggle that produces one. And there is
 * no score, grade, rating or verdict: we report what happened and never
 * characterise it (§5.6). A reader who wants to know whether this is good
 * decides that themselves, which is why the methodology and the caveats are on
 * the page rather than behind a link.
 */
export default async function BacktestRunPage({ params }: PageProps<"/backtests/[id]">) {
  const { id } = await params;

  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  if (!hasAcknowledgedRisk(identity.user)) redirect(nextPath(identity.user));
  const user = identity.user;

  const row = await loadRunForUser(id, user.id);
  if (!row) notFound();

  const attackReport = await latestReportForRun(id, user.id);

  const definition = row.definition as StrategyDefinition;

  const rules = resolveDefinition(definition);
  const methodology = row.run.methodology as RunMethodology;
  const costModel = row.run.costModel as CostModel;
  /**
   * Everything added with `backtest-2` is optional here, because
   * `backtest_runs` is append-only and rows written by the earlier engine do
   * not carry it. Absent is rendered as absent — never defaulted to zero, which
   * would read as "measured, and it was poor" for a run that never measured it.
   */
  const results = row.run.results as unknown as {
    netReturnPercent: number;
    maxDrawdownPercent: number;
    hitRatePercent: number;
    avgWinPaise: number;
    avgLossPaise: number;
    sharpe: number | null;
    tradeCount: number;
    exposurePercent: number;
    grossReturnPercent?: number;
    totalCostsPaise?: number;
    expectancyPaise?: number;
    expectancyR?: number | null;
    profitFactor?: number | null;
    sortino?: number | null;
    calmar?: number | null;
    longestLosingStreak?: number;
    topTradeSharePercent?: number | null;
    sampleAdequate?: boolean;
    trades: ExecutedTrade[];
    equityCurve: Array<{ date: string; equityPaise: number }>;
  };

  const finalEquity = results.equityCurve.at(-1)?.equityPaise ?? row.run.initialCapitalPaise;

  return (
    <AppShell>
      <AppBar backHref={`/strategies/${row.strategyId}`} />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">{row.strategyName}</h1>
        <p className="mt-[4px] text-[13px] text-muted">
          Backtest of v{row.versionNo} · {isoDate(row.run.periodStart)} → {isoDate(row.run.periodEnd)}
        </p>

        {row.hypothesis && (
          <p className="mt-4 rounded-[6px] border border-line p-3 text-[14px] text-ink">
            <span className="mr-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
              Hypothesis
            </span>
            {row.hypothesis}
          </p>
        )}

        {/*
          Net leads because it is the figure that means anything. Gross sits
          directly beneath it rather than behind a toggle — §8.3 requires the
          two together so the charges read as a gap rather than as a number
          somebody subtracted out of sight.
        */}
        <div className="mt-6 rounded-[8px] border border-line p-5">
          <span className="text-[12px] font-medium uppercase tracking-wide text-muted">
            Net return, after all costs
          </span>
          <p
            className={`mt-1 text-[32px] font-semibold tabular-nums ${
              results.netReturnPercent >= 0 ? "text-ink" : "text-danger-ink"
            }`}
          >
            {signed(results.netReturnPercent)}%
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {formatPaise(row.run.initialCapitalPaise as never, { withPaise: false })} →{" "}
            {formatPaise(finalEquity as never, { withPaise: false })}
          </p>

          {results.grossReturnPercent !== undefined && (
            <p className="mt-3 border-t border-divider-soft pt-3 text-[13px] text-muted">
              Before costs it was{" "}
              <span className="tabular-nums text-ink">{signed(results.grossReturnPercent)}%</span>.
              {results.totalCostsPaise !== undefined && (
                <>
                  {" "}
                  Brokerage, taxes and slippage took{" "}
                  <span className="tabular-nums text-ink">
                    {formatPaise(results.totalCostsPaise as never, { withPaise: false })}
                  </span>{" "}
                  across {results.tradeCount} trades.
                </>
              )}
            </p>
          )}
        </div>

        {/*
          §8.12 — below ~100 trades the sample cannot support an inference, and
          that has to be prominent rather than a footnote. A twelve-trade
          backtest with a flattering hit rate is the most misleading thing this
          engine can produce, and it looks exactly like a good one.
        */}
        {results.sampleAdequate === false && (
          <p className="mt-4 rounded-[6px] border border-danger-ink/40 bg-surface-alt p-4 text-[13px] text-ink">
            <span className="font-semibold text-danger-ink">
              {results.tradeCount} {results.tradeCount === 1 ? "trade" : "trades"} is too few to
              conclude anything.
            </span>{" "}
            Below about a hundred, the figures on this page describe what these particular trades
            did, not what the rules can be expected to do. The hit rate and the return are the two
            most misleading numbers at this sample size.
          </p>
        )}

        {/*
          Placed above the metrics, not below the trade table.
          §7.7's report is what qualifies every figure on this page, and a
          reader who has already absorbed the return before reaching it has
          formed the view the report exists to interrogate. A missing report is
          shown as missing for the same reason — skipping the bad news should be
          a visible choice, never a silent one.
        */}
        {attackReport ? (
          <Link
            href={`/backtests/${id}/attack`}
            className="mt-4 flex items-center justify-between gap-3 rounded-[6px] border border-line p-4"
          >
            <span className="text-[13px] text-ink">
              <span className="font-semibold">
                {(attackReport.findings as unknown[]).length === 0
                  ? "Attacked — nothing tripped"
                  : `${(attackReport.findings as unknown[]).length} ${
                      (attackReport.findings as unknown[]).length === 1 ? "finding" : "findings"
                    } against this run`}
              </span>
              <span className="mt-1 block text-muted">
                Reasons this backtest may be lying to you.
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-semibold text-brand underline">Read</span>
          </Link>
        ) : (
          <RunAttack runId={id} tradeCount={results.tradeCount} />
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="Max drawdown" value={`${results.maxDrawdownPercent.toFixed(2)}%`} />
          <Metric label="Trades" value={String(results.tradeCount)} />
          <Metric label="Hit rate" value={`${results.hitRatePercent.toFixed(1)}%`} />
          <Metric
            label="Expectancy"
            value={
              results.expectancyPaise === undefined
                ? NOT_RECORDED
                : `${formatPaise(results.expectancyPaise as never)}/trade`
            }
          />
          <Metric
            label="Expectancy in R"
            value={measured(results.expectancyR, (v) => `${signed(v)}R`)}
          />
          <Metric label="Profit factor" value={measured(results.profitFactor, (v) => v.toFixed(2))} />
          <Metric
            label="Sharpe"
            value={results.sharpe === null ? "Not measurable" : results.sharpe.toFixed(2)}
          />
          <Metric label="Sortino" value={measured(results.sortino, (v) => v.toFixed(2))} />
          <Metric label="Calmar" value={measured(results.calmar, (v) => v.toFixed(2))} />
          <Metric
            label="Longest losing run"
            value={
              results.longestLosingStreak === undefined
                ? NOT_RECORDED
                : `${results.longestLosingStreak} in a row`
            }
          />
          <Metric label="Average win" value={formatPaise(results.avgWinPaise as never)} />
          <Metric label="Average loss" value={formatPaise(results.avgLossPaise as never)} />
          <Metric
            label="Best trade's share"
            value={measured(results.topTradeSharePercent, (v) => `${v.toFixed(0)}% of profit`)}
          />
          <Metric label="Time in market" value={`${results.exposurePercent.toFixed(0)}%`} />
          <Metric label="Warm-up" value={`${methodology.data.warmUpBars} sessions`} />
          <Metric label="Fill model" value={FILL_MODEL_LABELS[methodology.execution.fillModel]} />
        </dl>

        <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Equity curve
        </h2>
        <div className="mt-3">
          <EquityCurve
            points={results.equityCurve}
            initialPaise={row.run.initialCapitalPaise}
          />
        </div>

        <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Every trade ({results.trades.length})
        </h2>
        {results.trades.length === 0 ? (
          <p className="mt-3 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
            These rules never triggered over this period. That is a result about the rules, not a
            failure of the run — nothing is hidden and nothing is retried automatically.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Instrument</th>
                  <th className="py-2 pr-3 font-medium">In</th>
                  <th className="py-2 pr-3 font-medium">Out</th>
                  <th className="py-2 pr-3 font-medium">Qty</th>
                  <th className="py-2 pr-3 font-medium">Why</th>
                  <th className="py-2 pr-3 text-right font-medium">Costs</th>
                  <th className="py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {results.trades.map((trade, i) => (
                  <tr key={i} className="border-b border-divider-soft align-top">
                    <td className="py-2 pr-3 text-ink">{trade.symbol}</td>
                    <td className="py-2 pr-3 text-muted">
                      {trade.entryDate}
                      <span className="block text-ink">
                        {formatPrice(priceTicks(trade.entryPrice))}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted">
                      {trade.exitDate}
                      <span className="block text-ink">
                        {formatPrice(priceTicks(trade.exitPrice))}
                      </span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-ink">{trade.qty}</td>
                    <td className="py-2 pr-3 text-muted">{EXIT_LABELS[trade.exitReason]}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted">
                      {formatPaise(trade.costs.totalPaise as never)}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums font-medium ${
                        trade.netPnlPaise >= 0 ? "text-ink" : "text-danger-ink"
                      }`}
                    >
                      {formatPaise(trade.netPnlPaise as never)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Methodology
        </h2>
        <p className="mt-2 text-[13px] text-muted">
          Published with the run, and permanent. Two runs over the same dates against data pulled
          months apart are different runs — the vintage below is what tells them apart.
        </p>

        <dl className="mt-3 flex flex-col gap-2 text-[13px]">
          <Row label="Engine" value={methodology.engineVersion} />
          <Row label="Data source" value={methodology.data.source} />
          <Row label="Adjustment" value={methodology.data.adjustment} />
          <Row label="Data vintage" value={methodology.data.vintage} />
          <Row label="Calendar" value={methodology.data.calendar} />
          <Row label="Signal" value={methodology.execution.signal} />
          <Row label="Fill" value={methodology.execution.fill} />
          <Row label="Stop-loss" value={methodology.execution.stopLoss} />
          <Row label="Gaps" value={methodology.execution.gapHandling} />
          <Row label="Sizing" value={methodology.execution.positionSizing} />
          <Row label="At period end" value={methodology.execution.openPositionsAtEnd} />
          <Row label="Direction" value={methodology.execution.direction} />
          <Row label="EMA seeding" value={methodology.indicators.emaSeeding} />
          <Row label="RSI smoothing" value={methodology.indicators.rsiSmoothing} />
          <Row label="Sharpe" value={methodology.metrics.sharpeAnnualisation} />
        </dl>

        <h3 className="mt-6 text-[12px] font-semibold uppercase tracking-wide text-muted">
          Cost model — {costModel.segment}
        </h3>
        <dl className="mt-2 flex flex-col gap-2 text-[13px]">
          <Row label="Brokerage" value={describeBrokerage(costModel)} />
          <Row label="STT" value={`${costModel.stt.percent}% (${costModel.stt.side.toLowerCase()})`} />
          <Row
            label="Stamp duty"
            value={`${costModel.stampDuty.percent}% (${costModel.stampDuty.side.toLowerCase()})`}
          />
          <Row label="Exchange" value={`${costModel.exchangeTransaction.percent}%`} />
          <Row label="SEBI turnover" value={`${costModel.sebiTurnover.percent}%`} />
          <Row label="GST" value={`${costModel.gstPercent}% of brokerage, exchange and SEBI fees`} />
          <Row label="Slippage assumed" value={`${costModel.slippagePercent}% of turnover`} />
        </dl>

        {/* Not a disclaimer. A reader who does not know these cannot judge the
            number above them. */}
        <h3 className="mt-6 text-[12px] font-semibold uppercase tracking-wide text-muted">
          What this run does not account for
        </h3>
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-[13px] text-muted">
          {methodology.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>

        <p className="mt-8 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
          A backtest is a statement about the past on data that was already known. It is not a
          forward test, and it is not evidence a strategy works. Next:{" "}
          <Link href={`/strategies/${row.strategyId}`} className="font-semibold text-brand">
            declare a hypothesis and lock parameters
          </Link>{" "}
          for a forward window (W6).
        </p>

        <p className="mt-4 text-[12px] text-muted">
          Rules tested — entry: {describeCondition(rules.entry)}; exit:{" "}
          {describeCondition(rules.exit)}; stop {rules.stopLossPercent}%;{" "}
          {rules.targetPercent === null ? "no target" : `target ${rules.targetPercent}%`}; size{" "}
          {describeSizing(rules.sizing)}.
        </p>
      </div>
    </AppShell>
  );
}

/**
 * Rendered when a run predates the metric entirely, which is a different thing
 * from a metric that was computed and came out empty. Both are honest; conflating
 * them is not.
 */
const NOT_RECORDED = "Not recorded";

/**
 * A metric that a newer engine computes but which may be null because there was
 * nothing to measure — no losing session, no drawdown, no risk taken.
 *
 * Null renders as "Not measurable", never as zero. Zero reads as *measured, and
 * it was poor*; the absence of evidence is not evidence of a bad result, and a
 * strategy with no losing session has an unmeasured Sortino rather than a
 * perfect one.
 */
function measured<T>(value: T | null | undefined, format: (value: T) => string): string {
  if (value === undefined) return NOT_RECORDED;
  if (value === null) return "Not measurable";
  return format(value);
}

const FILL_MODEL_LABELS: Record<FillModel, string> = {
  STOP_FIRST_WHEN_AMBIGUOUS: "Stop first when a bar reached both",
  INTRABAR_1M: "Resolved on 1-minute data",
};

const EXIT_LABELS: Record<ExecutedTrade["exitReason"], string> = {
  SIGNAL: "Exit rule",
  STOP_LOSS: "Stop-loss",
  TARGET: "Target",
  END_OF_PERIOD: "Period ended",
};

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function describeBrokerage(model: CostModel): string {
  if (model.brokerage.type === "FLAT_PAISE") {
    return model.brokerage.value === 0
      ? "None assumed"
      : `${formatPaise(model.brokerage.value as never)} per leg`;
  }
  const cap =
    model.brokerage.capPaise === undefined
      ? ""
      : `, capped at ${formatPaise(model.brokerage.capPaise as never)}`;
  return `${model.brokerage.value}% per leg${cap}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-line p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-[2px] text-[16px] font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[2px] sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-muted sm:w-[130px]">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{value}</dd>
    </div>
  );
}
