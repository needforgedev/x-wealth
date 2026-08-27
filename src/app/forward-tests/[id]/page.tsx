import { notFound, redirect } from "next/navigation";

import { forwardTests } from "@/db/schema";
import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { EquityCurve } from "@/components/advisor/EquityCurve";
import type { CostModel } from "@/domain/costs";
import {
  ForwardTestError,
  diffAgainstLedger,
  summariseLedger,
  type ForwardTestProgress,
  type LedgerRow,
} from "@/domain/forward-test";
import { BacktestError } from "@/domain/backtest";
import { formatPaise, formatPrice } from "@/domain/money";
import { hasAcknowledgedRisk, nextPath } from "@/domain/onboarding";
import { describeCondition, type StrategyDefinition } from "@/domain/strategy";
import { currentIdentity } from "@/server/identity";
import { liveEndOfDaySource } from "@/server/market-data/db-store";
import { replayForwardTest } from "@/server/forward-test/replay";
import { loadForwardTestForUser, tradesForForwardTest } from "@/server/queries/forward-test";
import { AbandonForwardTest } from "./AbandonForwardTest";

export const dynamic = "force-dynamic";

/**
 * The forward-test console — `plan.md` W6-07 and W6-11.
 *
 * The screen the product is actually about. A backtest page reports a finished
 * claim about the past; this one reports a commitment mid-flight, which is a
 * harder thing to show honestly. Three rules it is built around:
 *
 * **The hypothesis comes before the number.** It was written before any of this
 * existed and it cannot be edited. Putting it at the top is the difference
 * between a record and a scoreboard.
 *
 * **A running window is not a result, and says so.** Every figure on a RUNNING
 * test is labelled provisional, because a 12-session number presented like a
 * finished one is the single most misleading thing this page could do.
 *
 * **Nothing is characterised.** No score, no grade, no "on track". We report
 * what happened and let the reader judge it (§5.6).
 *
 * The three statuses are genuinely different screens rather than one screen
 * with fields blanked out:
 *
 *   - RUNNING — replayed live, so the curve reaches today's bar
 *   - COMPLETED — read from `final_results`, which was written once and is the
 *     published record; re-deriving it would risk showing something other than
 *     what was recorded
 *   - ABANDONED — the ledger only. Replaying would walk the sessions that
 *     printed *after* the advisor stopped and report trades from a window they
 *     had withdrawn from, which is a claim nobody made.
 */
export default async function ForwardTestConsolePage({
  params,
}: PageProps<"/forward-tests/[id]">) {
  const { id } = await params;

  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  if (!hasAcknowledgedRisk(identity.user)) redirect(nextPath(identity.user));
  const user = identity.user;

  const row = await loadForwardTestForUser(id, user.id);
  if (!row) notFound();

  const { test } = row;
  const definition = row.definition as StrategyDefinition;
  const costModel = test.costModel as CostModel;

  const recorded = (await tradesForForwardTest(test.id)).map(
    (t): LedgerRow => ({
      symbol: t.symbol,
      qty: t.qty,
      entryDate: isoDate(t.entryAt),
      exitDate: t.exitAt ? isoDate(t.exitAt) : null,
      netPnlPaise: t.netPnlPaise,
    }),
  );
  const ledger = summariseLedger(recorded);

  const isLive = test.status === "RUNNING" || test.status === "DRAFT";
  const live = isLive ? await replayLive({ test, definition, costModel }) : null;

  return (
    <AppShell>
      <AppBar backHref={`/strategies/${row.strategyId}`} />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <div className="mt-[24px] flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[20px] font-semibold text-ink">{row.strategyName}</h1>
          <StatusBadge status={test.status} />
        </div>
        <p className="mt-[4px] text-[13px] text-muted">
          Forward test of v{row.versionNo} · {test.plannedSessions}-session window
          {test.startedAt ? ` from ${isoDate(test.startedAt)}` : ""}
        </p>

        {/* The commitment, first. Frozen at RUNNING and never editable — that
            is what makes the numbers below mean anything. */}
        <section className="mt-5 rounded-[8px] border border-line p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Declared hypothesis
          </h2>
          <p className="mt-2 text-[14px] leading-[1.5] text-ink">{test.declaredHypothesis}</p>
          <p className="mt-3 text-[12px] text-muted">
            Written on {isoDate(test.createdAt)}, before any of this window existed. It cannot be
            edited, and neither can the rules, the capital or the cost model — changing any of them
            means abandoning this test and starting another, and this one stays on the record.
          </p>
        </section>

        {test.status === "ABANDONED" ? (
          <AbandonedBody test={test} ledger={ledger} />
        ) : test.status === "COMPLETED" ? (
          <CompletedBody test={test} />
        ) : live?.kind === "READY" ? (
          <RunningBody test={test} progress={live.progress} recorded={recorded} />
        ) : (
          <NotYetBody reason={live?.reason ?? "This test has not been replayed yet."} test={test} />
        )}

        {/* The ledger, in every status. It is the append-only record the figures
            above are checked against, and it is the same rows an investor will
            eventually see on the public profile. */}
        <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Paper-trade ledger ({recorded.length})
        </h2>
        <p className="mt-2 text-[12px] text-muted">
          Written by the evening job, one row per position, append-only. An exit is recorded exactly
          once and can never be rewritten.
        </p>
        <LedgerTable rows={recorded} />

        {ledger.unpriced > 0 && (
          <p role="alert" className="mt-3 rounded-[6px] bg-danger/[0.08] p-3 text-[13px] text-danger-ink">
            {ledger.unpriced} closed {ledger.unpriced === 1 ? "row has" : "rows have"} no net
            recorded. The totals above exclude {ledger.unpriced === 1 ? "it" : "them"} rather than
            counting {ledger.unpriced === 1 ? "it" : "them"} as zero. Please report this.
          </p>
        )}

        {isLive && (
          <section className="mt-8 rounded-[8px] border border-line p-4">
            <h2 className="text-[13px] font-semibold text-ink">Abandon this test</h2>
            <p className="mt-2 text-[13px] text-muted">
              Abandoning is a legitimate outcome and the honest one when a hypothesis has been
              answered early. It is permanent, it keeps everything recorded so far, and the reason
              you give is published alongside it — an abandoned test is the denominator that makes a
              completed one mean something.
            </p>
            <div className="mt-3">
              <AbandonForwardTest forwardTestId={test.id} />
            </div>
          </section>
        )}

        <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Frozen parameters
        </h2>
        <dl className="mt-3 flex flex-col gap-2 text-[13px]">
          <Row label="Entry" value={describeCondition(definition.entry)} />
          <Row label="Exit" value={describeCondition(definition.exit)} />
          <Row label="Stop-loss" value={`${definition.stopLossPercent}% below entry`} />
          <Row label="Position size" value={`${definition.positionSizePercent}% of cash on hand`} />
          <Row label="Instruments" value={definition.instruments.join(", ")} />
          <Row
            label="Capital"
            value={formatPaise(test.initialCapitalPaise as never, { withPaise: false })}
          />
          <Row label="Window" value={`${test.plannedSessions} trading sessions`} />
          <Row label="Costs" value={`${costModel.segment}, ${costModel.slippagePercent}% slippage`} />
        </dl>

        <p className="mt-8 text-[12px] text-muted">
          Every figure on this page is net of brokerage, STT, stamp duty, exchange and SEBI charges,
          GST and assumed slippage. There is no gross number here because there is no gross number
          anywhere in the system.
        </p>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// RUNNING — replayed live
// ---------------------------------------------------------------------------

function RunningBody({
  test,
  progress,
  recorded,
}: {
  test: TestRow;
  progress: ForwardTestProgress;
  recorded: readonly LedgerRow[];
}) {
  const { standing } = progress;

  // What the evening job would write if it ran now. Normally empty — the job
  // runs after the loader, so the ledger is current. Non-empty means either the
  // job has not run since the last session, or the two disagree about history,
  // and an advisor reading a curve is entitled to know which.
  const diff = diffAgainstLedger(progress.trades, progress.openPositions, recorded);
  const pending = diff.toOpen.length + diff.toEnter.length + diff.toClose.length;

  return (
    <>
      <Progress
        elapsed={standing.sessionsElapsed}
        planned={standing.plannedSessions}
        percent={standing.percentComplete}
      />

      <p className="mt-3 text-[13px] text-muted">
        {standing.sessionsRemaining} {standing.sessionsRemaining === 1 ? "session" : "sessions"} to
        go. Estimated close {test.plannedEndAt ? isoDate(test.plannedEndAt) : "unknown"} — an
        estimate, because the real end is whichever session turns out to be the{" "}
        {ordinal(standing.plannedSessions)}, and that is settled by the bars rather than by a
        holiday list. Latest session priced: {standing.lastSessionDate ?? "none"}.
      </p>

      {/* Provisional, stated before the number rather than under it. */}
      <div className="mt-6 rounded-[8px] border border-line p-5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Provisional · window still open
        </span>
        <p
          className={`mt-1 text-[32px] font-semibold tabular-nums ${
            standing.netReturnPercent >= 0 ? "text-ink" : "text-danger-ink"
          }`}
        >
          {signed(standing.netReturnPercent)}%
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {formatPaise(test.initialCapitalPaise as never, { withPaise: false })} →{" "}
          {formatPaise(standing.equityPaise as never, { withPaise: false })}, after every charge
          including the ones an exit has not paid yet.
        </p>

        <dl className="mt-4 flex flex-col gap-2 border-t border-divider-soft pt-3 text-[13px]">
          <SplitRow
            label={`Settled · ${standing.closedTradeCount} closed`}
            value={formatPaise(standing.realisedNetPnlPaise as never)}
          />
          <SplitRow
            label={`Marked · ${standing.openPositionCount} open`}
            value={formatPaise(standing.unrealisedNetPnlPaise as never)}
          />
          {standing.exitChargesOutstandingPaise > 0 && (
            <SplitRow
              label="Exit charges not yet paid"
              value={`−${formatPaise(standing.exitChargesOutstandingPaise as never)}`}
            />
          )}
        </dl>
      </div>

      <p className="mt-3 text-[13px] text-muted">
        This is not a result. A window that has not closed can still be reversed by the sessions
        left in it, and an open position is a price nobody has traded at.
      </p>

      <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
        Equity so far
      </h2>
      <div className="mt-3">
        <EquityCurve points={progress.equityCurve} initialPaise={test.initialCapitalPaise} />
      </div>
      {standing.exitChargesOutstandingPaise > 0 && (
        <p className="mt-2 text-[12px] text-muted">
          The curve values open positions at the session close, which is before the charges on
          selling them. Its last point sits{" "}
          {formatPaise(standing.exitChargesOutstandingPaise as never)} above the figure quoted
          above, and that gap is exactly those charges.
        </p>
      )}

      <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
        Running metrics
      </h2>
      <p className="mt-2 text-[12px] text-muted">
        Measured over {standing.sessionsElapsed} of {standing.plannedSessions} sessions and{" "}
        {standing.closedTradeCount} closed {standing.closedTradeCount === 1 ? "trade" : "trades"}.
        Drawdown, Sharpe and exposure are taken from the curve above, so they carry the same open
        marks.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="Max drawdown" value={`${progress.metrics.maxDrawdownPercent.toFixed(2)}%`} />
        <Metric label="Closed trades" value={String(progress.metrics.tradeCount)} />
        <Metric label="Hit rate" value={hitRate(progress)} />
        <Metric
          label="Sharpe"
          value={
            progress.metrics.sharpe === null
              ? "Not measurable"
              : progress.metrics.sharpe.toFixed(2)
          }
        />
        <Metric label="Average win" value={formatPaise(progress.metrics.avgWinPaise as never)} />
        <Metric label="Average loss" value={formatPaise(progress.metrics.avgLossPaise as never)} />
        <Metric label="Time in market" value={`${progress.metrics.exposurePercent.toFixed(0)}%`} />
        <Metric label="Sessions priced" value={String(progress.equityCurve.length)} />
      </dl>

      <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
        Open positions ({standing.openMarks.length})
      </h2>
      {standing.openMarks.length === 0 ? (
        <p className="mt-3 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
          Nothing open. Every figure above is settled money.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Instrument</th>
                <th className="py-2 pr-3 font-medium">Entered</th>
                <th className="py-2 pr-3 font-medium">Mark</th>
                <th className="py-2 pr-3 font-medium">Stop</th>
                <th className="py-2 pr-3 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Net if closed</th>
              </tr>
            </thead>
            <tbody>
              {standing.openMarks.map((mark) => (
                <tr key={`${mark.symbol}@${mark.entryDate}`} className="border-b border-divider-soft align-top">
                  <td className="py-2 pr-3 text-ink">{mark.symbol}</td>
                  <td className="py-2 pr-3 text-muted">
                    {mark.entryDate}
                    <span className="block text-ink">{formatPrice(mark.entryPrice)}</span>
                  </td>
                  <td className="py-2 pr-3 text-ink tabular-nums">{formatPrice(mark.markPrice)}</td>
                  <td className="py-2 pr-3 text-muted tabular-nums">
                    {formatPrice(mark.stopPrice)}
                    <span className="block">{mark.roomToStopPercent.toFixed(1)}% away</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink">{mark.qty}</td>
                  <td
                    className={`py-2 text-right tabular-nums font-medium ${
                      mark.netPnlIfClosedPaise >= 0 ? "text-ink" : "text-danger-ink"
                    }`}
                  >
                    {formatPaise(mark.netPnlIfClosedPaise as never)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-muted">
            &ldquo;Net if closed&rdquo; assumes a fill at the last close and pays both legs&rsquo;
            charges. No such trade has happened.
          </p>
        </div>
      )}

      {diff.unexplained.length > 0 ? (
        <p role="alert" className="mt-6 rounded-[6px] bg-danger/[0.08] p-4 text-[13px] text-danger-ink">
          The ledger holds {diff.unexplained.length}{" "}
          {diff.unexplained.length === 1 ? "trade" : "trades"} this replay does not produce, so the
          record and the engine disagree about what happened. The evening job has stopped advancing
          this test rather than writing more on top. Nothing here can be corrected —
          <code> paper_trades</code> is append-only — so please report it.
        </p>
      ) : (
        pending > 0 && (
          <p className="mt-6 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
            {pending} {pending === 1 ? "change is" : "changes are"} not in the ledger yet: the
            replay above has reached {standing.lastSessionDate} and the evening job has not written
            that far. Nothing is lost — the job replays the whole window and covers the gap on its
            next run.
          </p>
        )
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// COMPLETED — the recorded result, not a fresh derivation
// ---------------------------------------------------------------------------

function CompletedBody({ test }: { test: TestRow }) {
  const results = test.finalResults as
    | (RecordedResults & { equityCurve?: Array<{ date: string; equityPaise: number }> })
    | null;

  if (!results) {
    return (
      <p className="mt-6 rounded-[6px] bg-danger/[0.08] p-4 text-[13px] text-danger-ink">
        This test is marked completed but no result was recorded. That is a bug rather than an empty
        outcome — the row is written in the same statement as the status. Please report it.
      </p>
    );
  }

  const curve = results.equityCurve ?? [];
  const finalEquity = curve.at(-1)?.equityPaise ?? test.initialCapitalPaise;

  return (
    <>
      <div className="mt-6 rounded-[8px] border border-line p-5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Net return over the full window, after all costs
        </span>
        <p
          className={`mt-1 text-[32px] font-semibold tabular-nums ${
            results.netReturnPercent >= 0 ? "text-ink" : "text-danger-ink"
          }`}
        >
          {signed(results.netReturnPercent)}%
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {formatPaise(test.initialCapitalPaise as never, { withPaise: false })} →{" "}
          {formatPaise(finalEquity as never, { withPaise: false })} over {test.plannedSessions}{" "}
          sessions
          {test.startedAt && test.endedAt
            ? `, ${isoDate(test.startedAt)} → ${isoDate(test.endedAt)}`
            : ""}
        </p>
      </div>

      <p className="mt-3 text-[13px] text-muted">
        Written once, when the window closed, and permanent. Anything still open on the final
        session was closed at that session&rsquo;s close — nothing is left unresolved, because an
        unclosed position would let a losing trade sit off the books indefinitely.
      </p>

      <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
        Equity curve
      </h2>
      <div className="mt-3">
        <EquityCurve points={curve} initialPaise={test.initialCapitalPaise} />
      </div>

      <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
        Recorded metrics
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="Max drawdown" value={`${results.maxDrawdownPercent.toFixed(2)}%`} />
        <Metric label="Trades" value={String(results.tradeCount)} />
        <Metric
          label="Hit rate"
          value={results.tradeCount === 0 ? "No trades" : `${results.hitRatePercent.toFixed(1)}%`}
        />
        <Metric
          label="Sharpe"
          value={results.sharpe === null ? "Not measurable" : results.sharpe.toFixed(2)}
        />
        <Metric label="Average win" value={formatPaise(results.avgWinPaise as never)} />
        <Metric label="Average loss" value={formatPaise(results.avgLossPaise as never)} />
        <Metric label="Time in market" value={`${results.exposurePercent.toFixed(0)}%`} />
        <Metric label="Sessions" value={String(curve.length)} />
      </dl>
    </>
  );
}

// ---------------------------------------------------------------------------
// ABANDONED — the ledger, and the reason
// ---------------------------------------------------------------------------

function AbandonedBody({
  test,
  ledger,
}: {
  test: TestRow;
  ledger: ReturnType<typeof summariseLedger>;
}) {
  return (
    <>
      {/* The reason leads, and it is not tucked away. This is the outcome. */}
      <section className="mt-6 rounded-[8px] border border-line p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Abandoned{test.endedAt ? ` on ${isoDate(test.endedAt)}` : ""} — reason given
        </h2>
        <p className="mt-2 text-[14px] leading-[1.5] text-ink">
          {test.abandonReason ?? "No reason was recorded."}
        </p>
        <p className="mt-3 text-[12px] text-muted">
          Permanent and public. It stays on the profile beside every completed test, because the
          count of abandoned windows is what makes a published one mean anything.
        </p>
      </section>

      <div className="mt-6 rounded-[8px] border border-line p-5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Settled before it stopped
        </span>
        <p
          className={`mt-1 text-[28px] font-semibold tabular-nums ${
            ledger.realisedNetPnlPaise >= 0 ? "text-ink" : "text-danger-ink"
          }`}
        >
          {formatPaise(ledger.realisedNetPnlPaise as never)}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Across {ledger.closed} closed {ledger.closed === 1 ? "trade" : "trades"} — {ledger.winners}{" "}
          up, {ledger.losers} down
          {ledger.scratches > 0 ? `, ${ledger.scratches} flat` : ""}
          {ledger.open > 0
            ? `. ${ledger.open} ${ledger.open === 1 ? "position was" : "positions were"} still open and never closed, so ${ledger.open === 1 ? "it is" : "they are"} not in this figure.`
            : "."}
        </p>
      </div>

      <p className="mt-3 text-[13px] text-muted">
        There is no return percentage and no equity curve for an abandoned window. The window never
        ran its length, so a percentage would be a claim about a period the test withdrew from — and
        replaying the sessions that printed afterwards would report trades this advisor never
        committed to.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// RUNNING, but there is nothing to replay yet
// ---------------------------------------------------------------------------

function NotYetBody({ reason, test }: { reason: string; test: TestRow }) {
  return (
    <div className="mt-6 rounded-[8px] border border-line p-5">
      <h2 className="text-[15px] font-semibold text-ink">The window has not opened yet</h2>
      <p className="mt-2 text-[13px] text-muted">
        {reason} It opens on{" "}
        {test.startedAt ? isoDate(test.startedAt) : "the next trading session"} — the session after
        the newest bar that existed when the parameters froze, so that no part of this window was
        knowable in advance.
      </p>
      <p className="mt-3 text-[13px] text-muted">
        The parameters are already frozen and already on the record. Nothing here can be adjusted
        while waiting.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

type TestRow = typeof forwardTests.$inferSelect;

type RecordedResults = {
  netReturnPercent: number;
  maxDrawdownPercent: number;
  hitRatePercent: number;
  avgWinPaise: number;
  avgLossPaise: number;
  sharpe: number | null;
  tradeCount: number;
  exposurePercent: number;
};

type Live =
  | { kind: "READY"; progress: ForwardTestProgress }
  | { kind: "NOT_YET"; reason: string };

/**
 * Replay a running test for display.
 *
 * A test whose window opens tomorrow has no sessions yet, and the engine
 * correctly refuses to report on it — that is the state every test is in for
 * its first evening, so it is a case to render rather than an error to throw.
 * Anything else is a real fault and is logged before being shown as one.
 */
async function replayLive(input: {
  test: TestRow;
  definition: StrategyDefinition;
  costModel: CostModel;
}): Promise<Live> {
  const { test } = input;

  if (!test.startedAt) {
    return { kind: "NOT_YET", reason: "This test has no opening session recorded." };
  }

  try {
    return {
      kind: "READY",
      progress: await replayForwardTest({
        startedOn: isoDate(test.startedAt),
        plannedSessions: test.plannedSessions,
        initialCapitalPaise: test.initialCapitalPaise,
        costModel: input.costModel,
        definition: input.definition,
        source: await liveEndOfDaySource(),
      }),
    };
  } catch (error) {
    if (error instanceof ForwardTestError || error instanceof BacktestError) {
      return { kind: "NOT_YET", reason: `${error.message}.` };
    }
    console.error("[forward-test] console replay failed", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Progress({
  elapsed,
  planned,
  percent,
}: {
  elapsed: number;
  planned: number;
  percent: number;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">
          Session {elapsed} of {planned}
        </span>
        <span className="text-[12px] tabular-nums text-muted">{percent.toFixed(0)}%</span>
      </div>
      <div
        className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-ring-track"
        role="progressbar"
        aria-valuenow={elapsed}
        aria-valuemin={0}
        aria-valuemax={planned}
        aria-label={`Session ${elapsed} of ${planned}`}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Opening",
  RUNNING: "Running",
  COMPLETED: "Completed",
  ABANDONED: "Abandoned",
};

function StatusBadge({ status }: { status: string }) {
  // Abandoned is styled as a plain fact, not a warning. It is a legitimate
  // outcome, and colouring it as failure would be the product editorialising
  // about the one thing it exists to show without judgement.
  return (
    <span className="rounded-[3px] bg-surface-alt px-[8px] py-[3px] text-[11px] font-semibold uppercase tracking-wide text-tag-ink">
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function LedgerTable({ rows }: { rows: readonly LedgerRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="mt-3 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
        No trade has been recorded yet. These rules have not triggered since the window opened,
        which is a fact about the rules rather than a gap in the record.
      </p>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">Instrument</th>
            <th className="py-2 pr-3 font-medium">In</th>
            <th className="py-2 pr-3 font-medium">Out</th>
            <th className="py-2 pr-3 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.symbol}@${row.entryDate}`} className="border-b border-divider-soft">
              <td className="py-2 pr-3 text-ink">{row.symbol}</td>
              <td className="py-2 pr-3 text-muted">{row.entryDate}</td>
              <td className="py-2 pr-3 text-muted">{row.exitDate ?? "open"}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-ink">{row.qty}</td>
              <td
                className={`py-2 text-right tabular-nums font-medium ${
                  row.netPnlPaise === null
                    ? "text-muted"
                    : row.netPnlPaise >= 0
                      ? "text-ink"
                      : "text-danger-ink"
                }`}
              >
                {row.netPnlPaise === null ? "—" : formatPaise(row.netPnlPaise as never)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-line p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-[2px] text-[16px] font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function SplitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums font-medium text-ink">{value}</dd>
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

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** "No trades" rather than 0%, which reads as "measured, and none won". */
function hitRate(progress: ForwardTestProgress): string {
  return progress.metrics.tradeCount === 0
    ? "No closed trades"
    : `${progress.metrics.hitRatePercent.toFixed(1)}%`;
}
