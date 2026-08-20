import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { hasAcknowledgedRisk, nextInvestorPath } from "@/domain/investor-onboarding";
import { browseGroups } from "@/server/actions/group";
import { currentIdentity } from "@/server/identity";
import { MembershipButton } from "./MembershipButton";

export const dynamic = "force-dynamic";

/**
 * Public groups from verified advisors.
 *
 * Sorted newest first and by nothing else. There is no ranking, no "featured",
 * no score — `x-wealth-product.md` §5.10 rules out platform scoring, and every
 * ordering that is not a recorded fact is a scoring system with the label
 * removed. Recorded facts to sort on will exist once forward tests do.
 *
 * The counts shown are membership and how many strategies are published. Both
 * are real. There are no performance figures anywhere on this screen because
 * there are no performance figures to show.
 */
export default async function InvestorDiscoverPage() {
  const identity = await currentIdentity();
  if (!identity?.investor) redirect("/");
  if (!hasAcknowledgedRisk(identity.investor)) redirect(nextInvestorPath(identity.investor));

  const result = await browseGroups();
  const groups = result.ok ? result.data : [];

  return (
    <AppShell>
      <AppBar backHref="/investor/home" />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">Discover</h1>
        <p className="mt-[4px] text-[14px] text-muted">
          Groups run by SEBI-registered advisors. Joining is free.
        </p>

        {!result.ok && (
          <p role="alert" className="mt-4 text-[14px] text-danger-ink">
            {result.error}
          </p>
        )}

        {result.ok && groups.length === 0 ? (
          <div className="mt-6 rounded-[8px] border border-dashed border-line p-6 text-center">
            <p className="text-[15px] text-ink">No groups yet.</p>
            <p className="mt-2 text-[13px] text-muted">
              A group appears here once a verified advisor has created one and made it public.
            </p>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {groups.map((group) => (
              <li key={group.id} className="rounded-[8px] border border-line p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/investor/groups/${group.id}`}
                      className="block truncate text-[15px] font-semibold text-ink"
                    >
                      {group.name}
                    </Link>
                    <p className="mt-[2px] truncate text-[12px] text-muted">
                      {group.advisorName ?? "Advisor"}
                      {group.sebiRegistrationNo ? ` · ${group.sebiRegistrationNo}` : ""}
                    </p>
                  </div>
                  <MembershipButton
                    groupId={group.id}
                    joined={group.joined}
                    className="shrink-0 text-right"
                  />
                </div>

                {group.description && (
                  <p className="mt-2 text-[13px] leading-[1.5] text-ink">{group.description}</p>
                )}

                <p className="mt-2 text-[12px] text-muted">
                  {group.segment} · {group.strategyCount}{" "}
                  {group.strategyCount === 1 ? "strategy" : "strategies"} · {group.memberCount}{" "}
                  {group.memberCount === 1 ? "member" : "members"}
                </p>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 rounded-[6px] bg-surface-alt p-4 text-[13px] leading-[1.5] text-muted">
          No group here has a track record yet. The forward-test engine, which is what would
          produce one, is still being built — so nothing on this screen tells you whether an
          advisor is any good, and you should not read it as if it did.
        </p>
      </div>
    </AppShell>
  );
}
