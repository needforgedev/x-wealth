"use client";

import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { ADVISOR_TABS, BottomNav } from "@/components/BottomNav";
import { SectionHeader } from "@/components/SectionHeader";
import { SignalListCard } from "@/components/SignalListCard";
import { TopBar } from "@/components/TopBar";
import { PageTabs, type PageTab } from "@/components/ui/PageTabs";
import { DRAFT_SIGNALS, SIGNAL_REACH } from "@/lib/advisor";
import { ALL_SIGNALS } from "@/lib/signals";

const TABS: ReadonlyArray<PageTab> = [
  { id: "all", label: "All Signals" },
  { id: "drafts", label: "Drafts" },
];

/**
 * Every call this advisor has published, each card carrying its reach. The
 * Drafts tab holds calls that were saved but never sent, so they show no reach.
 */
export default function AdvisorSignalsPage() {
  const [tab, setTab] = useState(TABS[0].id);
  const isDrafts = tab === "drafts";
  const signals = isDrafts ? DRAFT_SIGNALS : ALL_SIGNALS;

  return (
    <AppShell className="bg-surface-alt">
      <TopBar showBack backHref="/advisor/chats" />

      {/* Only two tabs here, and the artboard pushes them to the outer edges. */}
      <div className="shrink-0 bg-surface px-[26px] pt-[16px]">
        <PageTabs
          className="justify-between"
          label="Signal filter"
          tabs={TABS}
          value={tab}
          onChange={setTab}
        />
      </div>

      <SectionHeader
        className="mt-[23px] shrink-0 px-[23px]"
        icon={{ src: "/assets/icon-clear-all.svg", width: 15.75, height: 8.75 }}
        title={isDrafts ? "Drafts" : "All Signals"}
      />

      <div className="flex flex-1 flex-col gap-[16px] px-[25px] pt-[18px] pb-6">
        {signals.map((signal) => (
          <SignalListCard
            key={signal.id}
            signal={signal}
            reach={isDrafts ? undefined : SIGNAL_REACH}
          />
        ))}
      </div>

      <BottomNav tabs={ADVISOR_TABS} />
    </AppShell>
  );
}
