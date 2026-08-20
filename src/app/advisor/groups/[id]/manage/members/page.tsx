import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { registrationGate } from "@/domain/registration-gate";
import { advisorGroupDetail, listGroupMembers } from "@/server/actions/group";
import { listGroupInvitations } from "@/server/actions/invitation";
import { currentIdentity } from "@/server/identity";
import { InviteForm, RevokeButton } from "./InviteForm";

export const dynamic = "force-dynamic";

const STATUS_LABELS = {
  PENDING: "Invited",
  ACCEPTED: "Joined",
  REVOKED: "Revoked",
} as const;

function day(value: Date): string {
  return value.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Who is in the group, and who has been asked.
 *
 * Members are shown by name and join date only. An advisor has a real need to
 * know their subscriber list; they do not need a phone number rendered on a
 * screen to have it, and personal data has a high bar here
 * (`x-wealth-product.md` §10). Invited numbers do appear, because the advisor
 * typed them in and is waiting on them.
 */
export default async function GroupMembersPage({
  params,
}: PageProps<"/advisor/groups/[id]/manage/members">) {
  const { id } = await params;

  const identity = await currentIdentity();
  if (!identity?.advisor) redirect("/");

  const gate = registrationGate(identity.advisor);
  if (!gate.allowed) redirect("/advisor/status");

  const [detail, members, invitations] = await Promise.all([
    advisorGroupDetail(id),
    listGroupMembers(id),
    listGroupInvitations(id),
  ]);

  if (!detail.ok) {
    return (
      <AppShell>
        <AppBar backHref={`/advisor/groups/${id}/manage`} />
        <div className="px-5">
          <p role="alert" className="mt-6 text-[14px] text-danger-ink">
            {detail.error}
          </p>
        </div>
      </AppShell>
    );
  }

  const isPrivate = detail.data.group.visibility === "PRIVATE";
  const pending = invitations.ok ? invitations.data.filter((i) => i.status === "PENDING") : [];
  const settled = invitations.ok ? invitations.data.filter((i) => i.status !== "PENDING") : [];

  return (
    <AppShell>
      <AppBar backHref={`/advisor/groups/${id}/manage`} />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">Members</h1>
        <p className="mt-[2px] text-[13px] text-muted">{detail.data.group.name}</p>

        <section className="mt-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
            In this group
          </h2>

          {!members.ok ? (
            <p role="alert" className="mt-3 text-[14px] text-danger-ink">
              {members.error}
            </p>
          ) : members.data.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted">
              Nobody has joined yet.
              {isPrivate
                ? " This group is private, so invite people by number below."
                : " It is public, so it will appear on Discover."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {members.data.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center gap-3 rounded-[8px] border border-line p-4"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
                    {member.name ?? "Investor"}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted">
                    joined {day(member.joinedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Invite</h2>
          <p className="mt-[4px] text-[13px] text-muted">
            {isPrivate
              ? "A private group can only be entered by invitation."
              : "This group is public, so an invitation is a nudge rather than the only way in."}
          </p>

          <div className="mt-3">
            <InviteForm groupId={id} />
          </div>

          {pending.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {pending.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex items-center gap-3 rounded-[8px] border border-line p-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{invitation.phone}</span>
                    <span className="mt-[2px] block text-[12px] text-muted">
                      invited {day(invitation.createdAt)}
                    </span>
                  </span>
                  <RevokeButton invitationId={invitation.id} />
                </li>
              ))}
            </ul>
          )}

          {settled.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {settled.map((invitation) => (
                <li key={invitation.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                    {invitation.phone}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted">
                    {STATUS_LABELS[invitation.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
