"use client";

import { use, useState } from "react";

import { SendSignalSheet } from "@/components/advisor/SendSignalSheet";
import { AppShell } from "@/components/AppShell";
import { Composer } from "@/components/chat/Composer";
import { GroupTopBar } from "@/components/chat/GroupTopBar";
import { MessageHeader } from "@/components/chat/MessageHeader";
import { SignalMessageCard } from "@/components/chat/SignalMessageCard";
import { GROUP, SAMPLE_SIGNAL, WELCOME_TEXT, WELCOME_TEXT_SHORT } from "@/lib/conversation";

/**
 * The advisor's view of a group conversation. Identical to the investor thread
 * except the composer leads with an add button that opens the Send Signal
 * sheet — posting calls is the advisor-only capability on this screen.
 */
export default function AdvisorGroupChatPage({ params }: PageProps<"/advisor/groups/[id]">) {
  const { id } = use(params);
  const [composing, setComposing] = useState(false);

  return (
    <AppShell className="bg-surface-alt">
      <GroupTopBar
        name={GROUP.name}
        members={GROUP.members}
        tint={GROUP.tint}
        backHref="/advisor/chats"
        href={`/advisor/groups/${id}/profile`}
      />

      <div className="flex flex-1 flex-col gap-[17px] px-[24px] pt-[31px] pb-[17px]">
        <article>
          <MessageHeader author="Snehish Yadav" time="12:23 PM" isAdmin />
          <p className="mt-[14px] rounded-tr-[12px] rounded-b-[12px] bg-surface px-[18px] py-[16px] text-[14px] leading-[1.45] text-ink shadow-[0_4px_9px_0_rgb(0_0_0/0.04)]">
            {WELCOME_TEXT}
          </p>
        </article>

        <article className="rounded-tr-[12px] rounded-b-[12px] bg-bubble-alt px-[18px] pt-[16px] pb-[10px] shadow-[0_4px_9px_0_rgb(0_0_0/0.04)]">
          <p className="text-[14px] leading-[1.45] text-bubble-alt-ink">{WELCOME_TEXT_SHORT}</p>
          <p className="mt-[6px] text-right text-[12px] font-semibold capitalize text-black/38">
            12:23 PM
          </p>
        </article>

        <article>
          <MessageHeader author="Snehish Yadav" time="12:23 PM" isAdmin />
          <div className="mt-[14px]">
            <SignalMessageCard signal={SAMPLE_SIGNAL} />
          </div>
        </article>

        <article>
          <MessageHeader author="Snehish Yadav" time="12:23 PM" isAdmin />
          <p className="mt-[14px] rounded-tr-[12px] rounded-b-[12px] bg-surface px-[18px] py-[16px] text-[14px] leading-[1.45] text-ink shadow-[0_4px_9px_0_rgb(0_0_0/0.04)]">
            {WELCOME_TEXT}
          </p>
        </article>
      </div>

      <Composer onAttach={() => setComposing(true)} />

      <SendSignalSheet open={composing} onClose={() => setComposing(false)} />
    </AppShell>
  );
}
