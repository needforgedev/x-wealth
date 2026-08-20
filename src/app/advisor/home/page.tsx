import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { registrationGate } from "@/domain/registration-gate";
import { currentIdentity } from "@/server/identity";
import { listStrategies } from "@/server/actions/strategy";

export const dynamic = "force-dynamic";

/**
 * Where a verified advisor works.
 *
 * Deliberately not a dashboard of numbers. PRD §10 warns against optimising for
 * volume — signals sent, strategies published — so this counts what the product
 * is actually about: how many tests have been run, and how they ended.
 */
export default async function AdvisorHomePage() {
  const identity = await currentIdentity();
  if (!identity?.advisor) redirect("/");

  const gate = registrationGate(identity.advisor);
  if (!gate.allowed) redirect("/advisor/status");

  const result = await listStrategies();
  const strategies = result.ok ? result.data : [];

  return (
    <AppShell>
      <AppBar showBack={false} />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <div className="mt-[24px] flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold text-ink">
              {identity.advisor.contactName ?? "Advisor"}
            </h1>
            <p className="mt-[2px] truncate text-[14px] text-muted">
              {identity.advisor.firmName} · {identity.advisor.sebiRegistrationNo}
            </p>
          </div>
          <Link href="/advisor/status" className="shrink-0 text-[13px] font-semibold text-brand">
            Status
          </Link>
        </div>

        <Link
          href="/advisor/groups"
          className="mt-6 flex items-center gap-3 rounded-[8px] border border-line p-4 hover:border-brand"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">Groups</span>
            <span className="mt-[2px] block text-[13px] text-muted">
              Distribute strategies, post calls and views.
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-semibold text-brand">Open</span>
        </Link>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
            Strategies
          </h2>
          <Link
            href="/advisor/strategies/new"
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
                  href={`/advisor/strategies/${s.id}`}
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
