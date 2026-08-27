import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { db } from "@/db";
import { strategies, strategyVersions } from "@/db/schema";
import { hasAcknowledgedRisk, nextPath } from "@/domain/onboarding";
import { describeCondition, type StrategyDefinition } from "@/domain/strategy";
import { loadCatalogue } from "@/server/market-data/catalogue";
import { listRunsForStrategy } from "@/server/queries/backtest";
import { listForwardTestsForStrategy } from "@/server/queries/forward-test";
import { currentIdentity } from "@/server/identity";
import { ReviseForm } from "./ReviseForm";
import { RunBacktest } from "./RunBacktest";
import { StartForwardTest } from "./StartForwardTest";

export const dynamic = "force-dynamic";

/**
 * A strategy and its full version history.
 *
 * This is the iteration ledger in its earliest form (PRD §5.6). Every version
 * is listed, oldest first, with the hypothesis that was declared for it. There
 * is no filter, no sort control and no way to hide one — by design.
 */
export default async function StrategyPage({ params }: PageProps<"/strategies/[id]">) {
  const { id } = await params;

  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  if (!hasAcknowledgedRisk(identity.user)) redirect(nextPath(identity.user));
  const user = identity.user;

  const database = db();
  const [strategy] = await database
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.userId, user.id)))
    .limit(1);
  if (!strategy) notFound();

  const versions = await database
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.strategyId, strategy.id))
    .orderBy(asc(strategyVersions.versionNo));

  const head = versions.at(-1);
  const [catalogue, runs, forwardTests] = await Promise.all([
    loadCatalogue(),
    listRunsForStrategy(strategy.id, user.id),
    listForwardTestsForStrategy(strategy.id, user.id),
  ]);

  const runsByVersion = new Map<number, typeof runs>();
  for (const entry of runs) {
    const existing = runsByVersion.get(entry.versionNo);
    if (existing) existing.push(entry);
    else runsByVersion.set(entry.versionNo, [entry]);
  }

  const testsByVersion = new Map<number, typeof forwardTests>();
  for (const entry of forwardTests) {
    const existing = testsByVersion.get(entry.versionNo);
    if (existing) existing.push(entry);
    else testsByVersion.set(entry.versionNo, [entry]);
  }

  return (
    <AppShell>
      <AppBar backHref="/home" />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">{strategy.name}</h1>
        {strategy.description && (
          <p className="mt-[6px] text-[14px] text-muted">{strategy.description}</p>
        )}

        <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Versions ({versions.length})
        </h2>

        <ol className="mt-3 flex flex-col gap-3">
          {versions.map((version) => {
            const definition = version.definition as StrategyDefinition;
            const isHead = version.id === strategy.currentVersionId;
            return (
              <li
                key={version.id}
                className={`rounded-[8px] border p-4 ${isHead ? "border-brand" : "border-line"}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[15px] font-semibold text-ink">v{version.versionNo}</span>
                  <span className="text-[12px] text-muted">
                    {version.createdAt.toISOString().slice(0, 10)}
                  </span>
                  {isHead && (
                    <span className="rounded-[3px] bg-brand/[0.12] px-[7px] py-[2px] text-[11px] font-semibold uppercase text-brand">
                      Current
                    </span>
                  )}
                </div>

                {version.hypothesisText && (
                  <p className="mt-2 text-[14px] text-ink">{version.hypothesisText}</p>
                )}

                <dl className="mt-3 flex flex-col gap-1 text-[13px]">
                  <Row label="Entry" value={describeCondition(definition.entry)} />
                  <Row label="Exit" value={describeCondition(definition.exit)} />
                  <Row label="Stop-loss" value={`${definition.stopLossPercent}%`} />
                  <Row label="Position size" value={`${definition.positionSizePercent}%`} />
                  <Row label="Instruments" value={definition.instruments.join(", ")} />
                </dl>

                {/* Every run for this version, newest first. There is no filter
                    and no way to hide one — that is the iteration ledger. */}
                {runsByVersion.get(version.versionNo)?.map(({ run }) => {
                  const results = run.results as unknown as {
                    netReturnPercent: number;
                    tradeCount: number;
                    maxDrawdownPercent: number;
                  };
                  return (
                    <Link
                      key={run.id}
                      href={`/backtests/${run.id}`}
                      className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[6px] bg-surface-alt px-3 py-2 text-[13px]"
                    >
                      <span
                        className={`font-semibold tabular-nums ${
                          results.netReturnPercent >= 0 ? "text-ink" : "text-danger-ink"
                        }`}
                      >
                        {results.netReturnPercent >= 0 ? "+" : ""}
                        {results.netReturnPercent.toFixed(2)}% net
                      </span>
                      <span className="text-muted">{results.tradeCount} trades</span>
                      <span className="text-muted">
                        −{results.maxDrawdownPercent.toFixed(1)}% drawdown
                      </span>
                      <span className="ml-auto text-[12px] text-muted">
                        {run.createdAt.toISOString().slice(0, 10)}
                      </span>
                    </Link>
                  );
                })}

                {/* Forward tests on this version, newest first. Running,
                    completed and abandoned all appear — an abandoned window is
                    the denominator that makes a completed one mean something
                    (PRD §5.6), so there is no filter and no way to add one. */}
                {testsByVersion.get(version.versionNo)?.map(({ test }) => (
                  <Link
                    key={test.id}
                    href={`/forward-tests/${test.id}`}
                    className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[6px] border border-line px-3 py-2 text-[13px]"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-tag-ink">
                      Forward · {FORWARD_STATUS[test.status] ?? test.status}
                    </span>
                    <span className="text-muted">{test.plannedSessions} sessions</span>
                    {describeForwardTest(test)}
                    <span className="ml-auto text-[12px] text-muted">
                      {test.startedAt ? test.startedAt.toISOString().slice(0, 10) : "not opened"}
                    </span>
                  </Link>
                ))}

                {isHead && (
                  <div className="mt-3 flex flex-col gap-3">
                    <RunBacktest
                      versionId={version.id}
                      runCount={runsByVersion.get(version.versionNo)?.length ?? 0}
                    />
                    <StartForwardTest versionId={version.id} versionNo={version.versionNo} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {head && (
          <div className="mt-6">
            <ReviseForm
              strategyId={strategy.id}
              name={strategy.name}
              description={strategy.description ?? ""}
              hypothesis={head.hypothesisText ?? ""}
              definition={head.definition as StrategyDefinition}
              catalogue={catalogue}
            />
          </div>
        )}

        <p className="mt-8 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
          A backtest is a statement about data that was already known when the rules were written. A
          forward test — declared hypothesis, locked parameters, a fixed window opening on a session
          that has not happened yet — is what the record is actually built on. Every one you start
          stays here, whatever it turns out to say.
        </p>
      </div>
    </AppShell>
  );
}

const FORWARD_STATUS: Record<string, string> = {
  DRAFT: "opening",
  RUNNING: "running",
  COMPLETED: "completed",
  ABANDONED: "abandoned",
};

/**
 * The one line a forward test gets in the version list.
 *
 * A running test shows no number at all. Its figures move every evening and
 * belong on the console where they can be labelled provisional — a percentage
 * in a list of results reads as a result, whatever the badge beside it says.
 */
function describeForwardTest(test: {
  status: string;
  outcome: string | null;
  finalResults: unknown;
  plannedSessions: number;
}) {
  if (test.status === "ABANDONED") {
    return <span className="text-muted">stopped early, reason on the record</span>;
  }

  const results = test.finalResults as { netReturnPercent: number; tradeCount: number } | null;
  if (test.status === "COMPLETED" && results) {
    return (
      <>
        <span
          className={`font-semibold tabular-nums ${
            results.netReturnPercent >= 0 ? "text-ink" : "text-danger-ink"
          }`}
        >
          {results.netReturnPercent >= 0 ? "+" : ""}
          {results.netReturnPercent.toFixed(2)}% net
        </span>
        <span className="text-muted">{results.tradeCount} trades</span>
      </>
    );
  }

  return <span className="text-muted">in progress</span>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[100px] shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{value}</dd>
    </div>
  );
}
