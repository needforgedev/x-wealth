import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { GroupFeed } from "@/components/groups/GroupFeed";
import { StrategyDigest } from "@/components/groups/StrategyDigest";
import { registrationGate } from "@/domain/registration-gate";
import { advisorGroupDetail } from "@/server/actions/group";
import { groupFeed } from "@/server/actions/signal";
import { currentIdentity } from "@/server/identity";
import { PostCall } from "./PostCall";
import { PostView } from "./PostView";
import { PublishStrategy } from "./PublishStrategy";
import { WithdrawButton } from "./WithdrawButton";

export const dynamic = "force-dynamic";

/**
 * Running one group: what is published into it, and what has been posted.
 *
 * This is the working screen. The Figma artboard for the advisor's group view
 * is a chat, and lives untouched at `/advisor/groups/[id]` — the same
 * separation the Alpha screens use, so the drawn version stays exactly as
 * drawn while the wired version is free to differ.
 */
export default async function ManageGroupPage({
  params,
  searchParams,
}: PageProps<"/advisor/groups/[id]/manage">) {
  const { id } = await params;
  const { before } = await searchParams;

  const identity = await currentIdentity();
  if (!identity?.advisor) redirect("/");

  const gate = registrationGate(identity.advisor);
  if (!gate.allowed) redirect("/advisor/status");

  const detail = await advisorGroupDetail(id);
  if (!detail.ok) {
    return (
      <AppShell>
        <AppBar backHref="/advisor/groups" />
        <div className="px-5">
          <p role="alert" className="mt-6 text-[14px] text-danger-ink">
            {detail.error}
          </p>
        </div>
      </AppShell>
    );
  }

  const { group, published, available } = detail.data;
  const feed = await groupFeed(id, { before: typeof before === "string" ? before : undefined });

  return (
    <AppShell>
      <AppBar backHref="/advisor/groups" />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <div className="mt-[24px]">
          <h1 className="text-[20px] font-semibold text-ink">{group.name}</h1>
          <p className="mt-[2px] text-[13px] text-muted">
            {group.segment} · {group.visibility === "PUBLIC" ? "Public" : "Private"} ·{" "}
            {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
          </p>
          {group.description && (
            <p className="mt-2 text-[14px] leading-[1.5] text-ink">{group.description}</p>
          )}
          <div className="mt-3 flex gap-4">
            <Link
              href={`/advisor/groups/${id}/manage/edit`}
              className="text-[13px] font-semibold text-brand"
            >
              Group info
            </Link>
            <Link
              href={`/advisor/groups/${id}/manage/members`}
              className="text-[13px] font-semibold text-brand"
            >
              Members &amp; invites
            </Link>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
            Strategies in this group
          </h2>

          {published.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted">
              Nothing published here yet. Members see the strategies you put in a group, and the
              calls you post from them.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {published.map((strategy) => (
                <li key={strategy.id}>
                  <StrategyDigest
                    strategy={strategy}
                    action={<WithdrawButton groupId={group.id} strategyId={strategy.id} />}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3">
            <PublishStrategy groupId={group.id} available={available} />
          </div>

          <Link href="/advisor/strategies/new" className="mt-3 block text-[13px] font-semibold text-brand">
            Author a new strategy
          </Link>
        </section>

        <section className="mt-8 flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Post</h2>
          <PostCall
            groupId={group.id}
            strategies={published.map((s) => ({ id: s.id, name: s.name }))}
          />
          <PostView groupId={group.id} />
        </section>

        <section className="mt-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Posted</h2>
          <div className="mt-3">
            {feed.ok ? (
              <>
                <GroupFeed
                  items={feed.data.items}
                  amendHrefFor={(signalId) =>
                    `/advisor/groups/${id}/manage/calls/${signalId}/amend`
                  }
                />
                {feed.data.nextCursor && (
                  <Link
                    href={`/advisor/groups/${id}/manage?before=${encodeURIComponent(feed.data.nextCursor)}`}
                    className="mt-3 block text-center text-[13px] font-semibold text-brand"
                  >
                    Load older
                  </Link>
                )}
                {before && (
                  <Link
                    href={`/advisor/groups/${id}/manage`}
                    className="mt-3 block text-center text-[13px] font-semibold text-muted"
                  >
                    Back to newest
                  </Link>
                )}
              </>
            ) : (
              <p role="alert" className="text-[14px] text-danger-ink">
                {feed.error}
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
