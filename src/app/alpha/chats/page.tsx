import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { SectionHeader } from "@/components/SectionHeader";
import { SignalCard } from "@/components/SignalCard";
import { AlphaGroupList } from "@/components/alpha/AlphaGroupList";
import { AlphaTopBar } from "@/components/alpha/AlphaTopBar";
import { ALPHA_TABS } from "@/lib/alpha";
import { RECENT_SIGNALS } from "@/lib/signals";

/**
 * Alpha's home. Same two sections as the investor Chats screen, under the
 * account header — avatar and account switch on the left, notifications on the
 * right — rather than a hamburger.
 */
export default function AlphaChatsPage() {
  return (
    <AppShell className="bg-surface-alt">
      <AlphaTopBar variant="account" />

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

        <div className="no-scrollbar mt-[24px] flex gap-[10px] overflow-x-auto px-[24px]">
          {RECENT_SIGNALS.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      </section>

      <AlphaGroupList />

      <BottomNav tabs={ALPHA_TABS} avatarSrc="/assets/user-photo.png" />
    </AppShell>
  );
}
