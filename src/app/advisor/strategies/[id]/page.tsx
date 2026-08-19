import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { db } from "@/db";
import { strategies, strategyVersions } from "@/db/schema";
import { registrationGate } from "@/domain/registration-gate";
import { describeCondition, type StrategyDefinition } from "@/domain/strategy";
import { currentIdentity } from "@/server/identity";
import { ReviseForm } from "./ReviseForm";

export const dynamic = "force-dynamic";

/**
 * A strategy and its full version history.
 *
 * This is the iteration ledger in its earliest form (PRD §5.6). Every version
 * is listed, oldest first, with the hypothesis that was declared for it. There
 * is no filter, no sort control and no way to hide one — by design.
 */
export default async function StrategyPage({ params }: PageProps<"/advisor/strategies/[id]">) {
  const { id } = await params;

  const identity = await currentIdentity();
  if (!identity?.advisor) redirect("/");
  if (!registrationGate(identity.advisor).allowed) redirect("/advisor/status");

  const database = db();
  const [strategy] = await database
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.advisorId, identity.advisor.id)))
    .limit(1);
  if (!strategy) notFound();

  const versions = await database
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.strategyId, strategy.id))
    .orderBy(asc(strategyVersions.versionNo));

  const head = versions.at(-1);

  return (
    <AppShell>
      <AppBar backHref="/advisor/home" />

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
            />
          </div>
        )}

        <p className="mt-8 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
          Next: backtest this version with a mandatory cost model, then declare a hypothesis and
          lock parameters for a fixed forward-test window. Both need a market data source — blocker
          B-1.
        </p>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[100px] shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{value}</dd>
    </div>
  );
}
