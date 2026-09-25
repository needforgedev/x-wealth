import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { hasAcknowledgedRisk, nextPath } from "@/domain/onboarding";
import { currentIdentity } from "@/server/identity";
import { ledgerCounts } from "@/server/queries/ledger";
import { listStrategies } from "@/server/actions/strategy";

export const dynamic = "force-dynamic";

/**
 * Where a trader works. The strategy list is the whole screen.
 *
 * Deliberately not a dashboard of numbers. `CLAUDE.md` §7 warns against
 * optimising for volume, so this counts what the product is actually about:
 * how many tests have been run, and how they ended.
 *
 * There is no gate here beyond being signed in and having acknowledged risk.
 * The registration check that stood in its place required a current SEBI
 * Research Analyst registration to reach this page — v2 has no registration to
 * hold and nothing to publish (§2).
 */
export default async function HomePage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  if (!hasAcknowledgedRisk(identity.user)) redirect(nextPath(identity.user));

  const [result, counts] = await Promise.all([
    listStrategies(),
    ledgerCounts(identity.user.id),
  ]);
  const strategies = result.ok ? result.data : [];

  return (
    <AppShell>
      <AppBar showBack={false} />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <div className="mt-[24px] flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold text-ink">
              {identity.user.contactName ?? "Account"}
            </h1>
            <p className="mt-[2px] truncate text-[14px] text-muted">
              {identity.user.planTier === "PRO" ? "Pro" : "Free"} plan
            </p>
          </div>
          <Link href="/profile" className="shrink-0 text-[13px] font-semibold text-brand">
            Profile
          </Link>
        </div>

        {/*
          The Groups card stood here — "distribute strategies, post calls and
          views". Removed rather than relinked: distribution is not a feature
          this product defers, it is one `CLAUDE.md` §8.5 prohibits, so there is
          no destination to point it at now or later.

          Nothing replaces it. The strategy list below is the whole screen.
        */}
        {/*
          The record, above the strategy list rather than below it.
          §7.14's counts are the frame these strategies are read inside — how
          many windows were opened and how many were stopped. Put after the
          list, it reads as a footnote about past attempts; put here, it is the
          context for the next one.
        */}
        <Link
          href="/ledger"
          className="mt-6 flex items-baseline justify-between gap-3 rounded-[8px] border border-line p-4"
        >
          <span className="text-[13px] text-ink">
            {counts.forwardTestsStarted === 0 ? (
              <>
                <span className="font-semibold">No forward tests yet.</span>
                <span className="mt-1 block text-muted">
                  {counts.backtests} {counts.backtests === 1 ? "backtest" : "backtests"} run.
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold tabular-nums">
                  {counts.forwardTestsStarted}{" "}
                  {counts.forwardTestsStarted === 1 ? "forward test" : "forward tests"} run
                </span>
                <span className="mt-1 block tabular-nums text-muted">
                  {counts.running} live · {counts.completed} completed · {counts.abandoned}{" "}
                  abandoned
                </span>
              </>
            )}
          </span>
          <span className="shrink-0 text-[13px] font-semibold text-brand underline">Record</span>
        </Link>

        {/* Step 1 of the loop, before any rules exist (§7.2). Placed above the
            strategy list because that is its place in the order of work. */}
        <Link
          href="/workbench"
          className="mt-6 flex items-center justify-between gap-3 rounded-[8px] border border-line p-4 hover:border-brand"
        >
          <span className="text-[14px] leading-[1.4] text-ink">
            <span className="block font-semibold">Start with a hypothesis</span>
            <span className="mt-1 block text-[13px] text-muted">
              Say what you expect and what would prove you wrong — before rules, before data.
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-semibold text-brand underline">Workbench</span>
        </Link>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
            Strategies
          </h2>
          <Link
            href="/strategies/new"
            className="flex h-[36px] items-center rounded-[4px] bg-brand px-4 text-[14px] font-semibold text-white"
          >
            New strategy
          </Link>
        </div>

        {strategies.length === 0 ? (
          <div className="mt-4 rounded-[8px] border border-dashed border-line p-6 text-center">
            <p className="text-[15px] text-ink">Nothing authored yet.</p>
            <p className="mt-2 text-[13px] text-muted">
              A strategy is rules — an indicator, a condition, an action. You declare a hypothesis
              first, then test it. Both are recorded before any result exists.
            </p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {strategies.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/strategies/${s.id}`}
                  className="flex items-center gap-3 rounded-[8px] border border-line p-4 hover:border-brand"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">
                      {s.name}
                    </span>
                    {s.description && (
                      <span className="mt-[2px] block truncate text-[13px] text-muted">
                        {s.description}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted">
                    v{s.versionCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
          Backtesting and the forward-test window come next (W5, W6). Both need a market data
          source, which is still an open legal question — blocker B-1.
        </p>
      </div>
    </AppShell>
  );
}
