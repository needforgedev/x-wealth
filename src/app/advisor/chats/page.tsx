import Link from "next/link";

import { AdvisorStatsHero } from "@/components/advisor/AdvisorStatsHero";
import { AppShell } from "@/components/AppShell";
import { ADVISOR_TABS, BottomNav } from "@/components/BottomNav";
import { ChatRow } from "@/components/ChatRow";
import { SectionHeader } from "@/components/SectionHeader";
import { TopBar } from "@/components/TopBar";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { CHAT_THREADS } from "@/lib/chats";

/**
 * The advisor's home. Same group list as the investor Chats screen, but the
 * recent-signals rail is replaced by a performance panel and the list action
 * creates a group instead of joining one.
 */
export default function AdvisorChatsPage() {
  return (
    <AppShell className="bg-surface-alt">
      <TopBar />
      <AdvisorStatsHero />

      <SectionHeader
        className="mt-[27px] shrink-0 px-[23px]"
        icon={{ src: "/assets/icon-group.svg", width: 17.5, height: 12.25 }}
        title="My Groups"
        action={
          <Link href="/advisor/create-group" className="flex items-center gap-[9px]">
            <span className="flex size-[19px] items-center justify-center text-muted">
              <MaskIcon src="/assets/icon-add-box.svg" width={14.25} height={14.25} />
            </span>
            <span className="text-[12px] font-semibold uppercase text-muted">Create New</span>
          </Link>
        }
      />

      <div className="flex-1 bg-surface">
        <ul className="flex flex-col gap-[19px] pt-[25px]">
          {CHAT_THREADS.map((thread) => (
            <ChatRow key={thread.id} thread={thread} basePath="/advisor/groups" />
          ))}
        </ul>
      </div>

      <BottomNav tabs={ADVISOR_TABS} />
    </AppShell>
  );
}
