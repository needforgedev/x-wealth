import Link from "next/link";

import { ChatRow } from "@/components/ChatRow";
import { SectionHeader } from "@/components/SectionHeader";
import { SignalCard } from "@/components/SignalCard";
import { TopBar } from "@/components/TopBar";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { CHAT_THREADS } from "@/lib/chats";
import { RECENT_SIGNALS } from "@/lib/signals";

/**
 * The Chats screen content, minus the bottom nav. Shared by /chats and the two
 * account screens, which are the same artboard with the nav avatar swapped and
 * a sheet layered on top.
 */
export function ChatsScreenBody() {
  return (
    <>
      <TopBar />

      <section className="shrink-0 bg-surface-alt pb-[13px]">
        <SectionHeader
          className="mt-[26px] px-[23px]"
          icon={{ src: "/assets/icon-clear-all.svg", width: 15.75, height: 8.75 }}
          title="Recent Signals"
          action={
            <Link href="/signals" className="text-[12px] font-semibold capitalize text-muted">
              View All
            </Link>
          }
        />

        {/* Horizontal rail — the third card is deliberately cut off on the artboard. */}
        <div className="no-scrollbar mt-[24px] flex gap-[10px] overflow-x-auto px-[24px]">
          {RECENT_SIGNALS.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>

        <SectionHeader
          className="mt-[26px] px-[23px]"
          icon={{ src: "/assets/icon-group.svg", width: 17.5, height: 12.25 }}
          title="My Groups"
          action={
            <Link href="/discover" className="flex items-center gap-[9px]">
              <span className="flex size-[19px] items-center justify-center text-muted">
                <MaskIcon src="/assets/icon-add-box.svg" width={14.25} height={14.25} />
              </span>
              <span className="text-[12px] font-semibold uppercase text-muted">Join Group</span>
            </Link>
          }
        />
      </section>

      <div className="flex-1 bg-surface">
        <ul className="flex flex-col gap-[19px] pt-[25px]">
          {CHAT_THREADS.map((thread) => (
            <ChatRow key={thread.id} thread={thread} />
          ))}
        </ul>
      </div>
    </>
  );
}
