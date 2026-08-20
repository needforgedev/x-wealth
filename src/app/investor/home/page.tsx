import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { hasAcknowledgedRisk, nextInvestorPath } from "@/domain/investor-onboarding";
import { listJoinedGroups } from "@/server/actions/group";
import { currentIdentity } from "@/server/identity";
import { SignOutButton } from "@/app/advisor/status/SignOutButton";

export const dynamic = "force-dynamic";

/**
 * The investor's landing page.
 *
 * Groups are real now, so this lists them. What is still absent is any measure
 * of whether an advisor is worth following: a strategy earns a track record by
 * completing a forward test (PRD §5.7, §5.10), and the forward-test engine does
 * not exist. The note at the bottom says that plainly rather than letting the
 * screen imply otherwise by staying quiet.
 */
export default async function InvestorHomePage() {
  const identity = await currentIdentity();
  if (!identity?.investor) redirect("/");

  const investor = identity.investor;
  if (!hasAcknowledgedRisk(investor)) redirect(nextInvestorPath(investor));

  const result = await listJoinedGroups();
  const groups = result.ok ? result.data : [];

  return (
    <AppShell>
      <AppBar showBack={false} />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">
          {investor.contactName ?? "Investor"}
        </h1>
        <p className="mt-[2px] text-[14px] text-muted">
          {investor.experienceLevel
            ? investor.experienceLevel.replace("_", " ").toLowerCase()
            : "—"}
          {investor.interests?.length ? ` · ${investor.interests.join(", ")}` : ""}
        </p>

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
            Your groups
          </h2>
          <Link
            href="/investor/discover"
            className="flex h-[36px] items-center rounded-[4px] bg-brand px-4 text-[14px] font-semibold text-white"
          >
            Discover
          </Link>
        </div>

        {!result.ok && (
          <p role="alert" className="mt-3 text-[14px] text-danger-ink">
            {result.error}
          </p>
        )}

        {groups.length === 0 ? (
          <div className="mt-3 rounded-[8px] border border-dashed border-line p-6 text-center">
            <p className="text-[15px] text-ink">You have not joined a group yet.</p>
            <p className="mt-2 text-[13px] text-muted">
              A group is where an advisor publishes strategies and posts the calls that come from
              them. Joining is free.
            </p>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  href={`/investor/groups/${group.id}`}
                  className="flex items-center gap-3 rounded-[8px] border border-line p-4 hover:border-brand"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">
                      {group.name}
                    </span>
                    <span className="mt-[2px] block text-[13px] text-muted">
                      {group.segment} · {group.strategyCount}{" "}
                      {group.strategyCount === 1 ? "strategy" : "strategies"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 rounded-[6px] bg-surface-alt p-4">
          <p className="text-[13px] leading-[1.5] text-muted">
            Nothing here has a track record. A strategy earns one by being run forward on paper for
            a full window, and that engine is still being built — so every call you see is marked
            as not forward-tested, and there is no number anywhere telling you an advisor is good.
          </p>
          <p className="mt-3 text-[13px] leading-[1.5] text-muted">
            Risk disclosure acknowledged{" "}
            {investor.riskAckAt ? investor.riskAckAt.toISOString().slice(0, 10) : ""}. You act on
            signals only in your own broker account — X-Wealth never places an order and never
            holds your money.
          </p>
        </div>

        <div className="mt-auto pt-8">
          <SignOutButton />
        </div>
      </div>
    </AppShell>
  );
}
