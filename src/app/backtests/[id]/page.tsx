import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { EquityCurve } from "@/components/advisor/EquityCurve";
import type { ExecutedTrade } from "@/domain/backtest";
import type { CostModel } from "@/domain/costs";
import type { RunMethodology } from "@/domain/methodology";
import { formatPaise, formatPrice, priceTicks } from "@/domain/money";
import { hasAcknowledgedRisk, nextPath } from "@/domain/onboarding";
import { describeCondition, type StrategyDefinition } from "@/domain/strategy";
import { currentIdentity } from "@/server/identity";
import { loadRunForUser } from "@/server/queries/backtest";

export const dynamic = "force-dynamic";

/**
 * One backtest run, in full.
 *
 * Every figure here is net of costs — there is no gross number on this page
 * because there is no gross number anywhere in the system (§5.3). And there is
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

  const definition = row.definition as StrategyDefinition;
  const methodology = row.run.methodology as RunMethodology;
  const costModel = row.run.costModel as CostModel;
  const results = row.run.results as unknown as {
    netReturnPercent: number;
    maxDrawdownPercent: number;
    hitRatePercent: number;
    avgWinPaise: number;
    avgLossPaise: number;
    sharpe: number | null;
    tradeCount: number;
    exposurePercent: number;
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

        {/* Net return leads, because it is the only return that exists here. */}
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
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="Max drawdown" value={`${results.maxDrawdownPercent.toFixed(2)}%`} />
          <Metric label="Trades" value={String(results.tradeCount)} />
          <Metric label="Hit rate" value={`${results.hitRatePercent.toFixed(1)}%`} />
          <Metric
            label="Sharpe"
            value={results.sharpe === null ? "Not measurable" : results.sharpe.toFixed(2)}
          />
          <Metric label="Average win" value={formatPaise(results.avgWinPaise as never)} />
          <Metric label="Average loss" value={formatPaise(results.avgLossPaise as never)} />
          <Metric label="Time in market" value={`${results.exposurePercent.toFixed(0)}%`} />
          <Metric label="Warm-up" value={`${methodology.data.warmUpBars} sessions`} />
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
          Rules tested — entry: {describeCondition(definition.entry)}; exit:{" "}
          {describeCondition(definition.exit)}; stop {definition.stopLossPercent}%; size{" "}
          {definition.positionSizePercent}% per position.
        </p>
      </div>
    </AppShell>
  );
}

const EXIT_LABELS: Record<ExecutedTrade["exitReason"], string> = {
  SIGNAL: "Exit rule",
  STOP_LOSS: "Stop-loss",
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
