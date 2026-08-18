"use client";

import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { SectionHeader } from "@/components/SectionHeader";
import { SignalListCard } from "@/components/SignalListCard";
import { TopBar } from "@/components/TopBar";
import { PageTabs, type PageTab } from "@/components/ui/PageTabs";
import { ALL_SIGNALS } from "@/lib/signals";

const TABS: ReadonlyArray<PageTab> = [
  { id: "all", label: "All Signals" },
  { id: "invested", label: "Invested" },
  { id: "watchlist", label: "Watchlist" },
];

export default function SignalsPage() {
  const [tab, setTab] = useState(TABS[0].id);

  return (
    <AppShell className="bg-surface-alt">
      <TopBar showBack backHref="/chats" />

      <div className="shrink-0 bg-surface px-[26px] pt-[16px]">
        <PageTabs label="Signal filter" tabs={TABS} value={tab} onChange={setTab} />
      </div>

      <SectionHeader
        className="mt-[23px] shrink-0 px-[23px]"
        icon={{ src: "/assets/icon-clear-all.svg", width: 15.75, height: 8.75 }}
        title="All Signals"
        action={
          <button type="button" className="text-[12px] font-semibold uppercase text-muted">
            Alerts
          </button>
        }
      />

      <div className="flex flex-1 flex-col gap-[16px] px-[23px] pt-[18px] pb-6">
        {ALL_SIGNALS.map((signal) => (
          <SignalListCard key={signal.id} signal={signal} />
        ))}
      </div>

      <BottomNav />
    </AppShell>
  );
}
