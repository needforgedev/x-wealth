import { AppShell } from "@/components/AppShell";
import { Composer } from "@/components/chat/Composer";
import { GroupTopBar } from "@/components/chat/GroupTopBar";
import { MessageHeader } from "@/components/chat/MessageHeader";
import { SignalMessageCard } from "@/components/chat/SignalMessageCard";
import { GROUP, SAMPLE_SIGNAL, WELCOME_TEXT } from "@/lib/conversation";

export default async function GroupThreadPage({ params }: PageProps<"/groups/[id]/thread">) {
  const { id } = await params;

  return (
    <AppShell className="bg-surface-alt">
      <GroupTopBar
        name={GROUP.name}
        members={GROUP.members}
        tint={GROUP.tint}
        backHref={`/groups/${id}`}
        href={`/groups/${id}/profile`}
      />

      {/* The signal the thread hangs off, pinned on its own band. */}
      <section className="shrink-0 bg-thread-band px-[24px] pt-[63px] pb-[31px]">
        <MessageHeader author="Snehish Yadav" time="12:23 PM" isAdmin />
        <div className="mt-[14px]">
          <SignalMessageCard signal={SAMPLE_SIGNAL} />
        </div>
      </section>

      <div className="flex flex-1 flex-col gap-[17px] px-[24px] pt-[70px] pb-[17px]">
        <article>
          <MessageHeader author="Snehish Yadav" time="12:23 PM" isAdmin />
          <p className="mt-[14px] rounded-tr-[12px] rounded-b-[12px] bg-surface px-[18px] py-[16px] text-[14px] leading-[1.45] text-ink shadow-[0_4px_9px_0_rgb(0_0_0/0.04)]">
            {WELCOME_TEXT}
          </p>
        </article>
      </div>

      <Composer />
    </AppShell>
  );
}
