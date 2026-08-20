import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { registrationGate } from "@/domain/registration-gate";
import { listAdvisorGroups } from "@/server/actions/group";
import { currentIdentity } from "@/server/identity";

export const dynamic = "force-dynamic";

/**
 * The advisor's groups.
 *
 * Two numbers per group and no others: how many people are in it and how many
 * strategies are published to it. Both are facts. PRD §10 warns against
 * dashboards that optimise for volume, and a "signals sent this week" figure
 * here would quietly make posting more the goal than testing.
 */
export default async function AdvisorGroupsPage() {
  const identity = await currentIdentity();
  if (!identity?.advisor) redirect("/");

  const gate = registrationGate(identity.advisor);
  if (!gate.allowed) redirect("/advisor/status");

  const result = await listAdvisorGroups();
  const groups = result.ok ? result.data : [];

  return (
    <AppShell>
      <AppBar backHref="/advisor/home" />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <div className="mt-[24px] flex items-center justify-between">
          <h1 className="text-[20px] font-semibold text-ink">Groups</h1>
          <Link
            href="/advisor/groups/new"
            className="flex h-[36px] items-center rounded-[4px] bg-brand px-4 text-[14px] font-semibold text-white"
          >
            New group
          </Link>
        </div>

        {!result.ok && (
          <p role="alert" className="mt-4 text-[14px] text-danger-ink">
            {result.error}
          </p>
        )}

        {groups.length === 0 ? (
          <div className="mt-4 rounded-[8px] border border-dashed border-line p-6 text-center">
            <p className="text-[15px] text-ink">No groups yet.</p>
            <p className="mt-2 text-[13px] text-muted">
              A group is where you distribute strategies. You choose which of your strategies goes
              into which group, and investors who join see those and the calls you post from them.
            </p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  href={`/advisor/groups/${group.id}/manage`}
                  className="block rounded-[8px] border border-line p-4 hover:border-brand"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                      {group.name}
                    </span>
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted">
                      {group.visibility === "PUBLIC" ? "Public" : "Private"}
                    </span>
                  </div>
                  {group.description && (
                    <p className="mt-[2px] truncate text-[13px] text-muted">{group.description}</p>
                  )}
                  <p className="mt-2 text-[12px] text-muted">
                    {group.segment} · {group.strategyCount}{" "}
                    {group.strategyCount === 1 ? "strategy" : "strategies"} · {group.memberCount}{" "}
                    {group.memberCount === 1 ? "member" : "members"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
