import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { GroupFeed } from "@/components/groups/GroupFeed";
import { StrategyDigest } from "@/components/groups/StrategyDigest";
import { hasAcknowledgedRisk, nextInvestorPath } from "@/domain/investor-onboarding";
import { investorGroupDetail } from "@/server/actions/group";
import { groupFeed } from "@/server/actions/signal";
import { currentIdentity } from "@/server/identity";
import { MembershipButton } from "@/app/investor/discover/MembershipButton";

export const dynamic = "force-dynamic";

/**
 * A group, as an investor sees it.
 *
 * Contents are members-only: the strategy rules and the feed both require an
 * active subscription, checked server-side on every read rather than by not
 * rendering a link. Before joining you see who runs it and how many strategies
 * are in it, which is enough to decide and nothing more.
 */
export default async function InvestorGroupPage({
  params,
  searchParams,
}: PageProps<"/investor/groups/[id]">) {
  const { id } = await params;
  const { before } = await searchParams;

  const identity = await currentIdentity();
  if (!identity?.investor) redirect("/");
  if (!hasAcknowledgedRisk(identity.investor)) redirect(nextInvestorPath(identity.investor));

  const detail = await investorGroupDetail(id);
  if (!detail.ok) {
    return (
      <AppShell>
        <AppBar backHref="/investor/discover" />
        <div className="px-5">
          <p role="alert" className="mt-6 text-[14px] text-danger-ink">
            {detail.error}
          </p>
        </div>
      </AppShell>
    );
  }

  const { group, joined, published } = detail.data;
  const feed = joined
    ? await groupFeed(id, { before: typeof before === "string" ? before : undefined })
    : null;

  return (
    <AppShell>
      <AppBar backHref="/investor/discover" />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <div className="mt-[24px] flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-semibold text-ink">{group.name}</h1>
            <p className="mt-[2px] text-[13px] text-muted">
              {group.advisorName ?? "Advisor"}
              {group.sebiRegistrationNo ? ` · ${group.sebiRegistrationNo}` : ""}
            </p>
            <p className="mt-[2px] text-[13px] text-muted">
              {group.segment} · {group.memberCount}{" "}
              {group.memberCount === 1 ? "member" : "members"}
            </p>
          </div>
          <MembershipButton groupId={group.id} joined={joined} className="shrink-0 text-right" />
        </div>

        {group.description && (
          <p className="mt-3 text-[14px] leading-[1.5] text-ink">{group.description}</p>
        )}

        {!joined ? (
          <div className="mt-8 rounded-[8px] border border-dashed border-line p-6">
            <p className="text-[15px] text-ink">Join to see what is inside.</p>
            <p className="mt-2 text-[13px] leading-[1.5] text-muted">
              Members see the rules behind each strategy in this group — what it trades, when it
              enters and exits, where the stop sits — and every call and view the advisor posts.
            </p>
            <p className="mt-3 text-[13px] leading-[1.5] text-muted">
              No call in this group is backed by a forward test yet, because the engine that would
              run one is still being built. Each one says so on its face.
            </p>
          </div>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
                Strategies
              </h2>
              {published.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted">
                  The advisor has not published a strategy into this group yet.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {published.map((strategy) => (
                    <li key={strategy.id}>
                      <StrategyDigest strategy={strategy} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
                Calls and views
              </h2>
              <div className="mt-3">
                {feed?.ok ? (
                  <>
                    <GroupFeed items={feed.data.items} />
                    {feed.data.nextCursor && (
                      <Link
                        href={`/investor/groups/${id}?before=${encodeURIComponent(feed.data.nextCursor)}`}
                        className="mt-3 block text-center text-[13px] font-semibold text-brand"
                      >
                        Load older
                      </Link>
                    )}
                    {before && (
                      <Link
                        href={`/investor/groups/${id}`}
                        className="mt-3 block text-center text-[13px] font-semibold text-muted"
                      >
                        Back to newest
                      </Link>
                    )}
                  </>
                ) : (
                  <p role="alert" className="text-[14px] text-danger-ink">
                    {feed?.error ?? "Could not load this group."}
                  </p>
                )}
              </div>
            </section>

            <p className="mt-8 rounded-[6px] bg-surface-alt p-4 text-[13px] leading-[1.5] text-muted">
              You act on any of this in your own broker account. X-Wealth never places an order and
              never holds your money.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
