import { MemberRow } from "@/components/advisor/MemberRow";
import { AppShell } from "@/components/AppShell";
import { ADVISOR_TABS, BottomNav } from "@/components/BottomNav";
import { GroupTopBar } from "@/components/chat/GroupTopBar";
import { SectionHeader } from "@/components/SectionHeader";
import { MEMBERS } from "@/lib/advisor";
import { GROUP } from "@/lib/conversation";

/** Everyone in the group, with an overflow menu per person for moderation. */
export default async function AdvisorGroupMembersPage({
  params,
}: PageProps<"/advisor/groups/[id]/members">) {
  const { id } = await params;

  return (
    <AppShell className="bg-surface-alt">
      <GroupTopBar
        name={GROUP.name}
        members={GROUP.members}
        tint={GROUP.tint}
        backHref={`/advisor/groups/${id}`}
        href={`/advisor/groups/${id}/profile`}
      />

      <SectionHeader
        className="mt-[26px] shrink-0 px-[34px]"
        icon={{ src: "/assets/icon-group.svg", width: 17.5, height: 12.25 }}
        title="All Members"
      />

      <ul className="flex flex-1 flex-col gap-[24px] px-[34px] pt-[24px] pb-6">
        {MEMBERS.map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
      </ul>

      <BottomNav tabs={ADVISOR_TABS} />
    </AppShell>
  );
}
