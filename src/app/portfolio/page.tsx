"use client";

import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { HoldingRow } from "@/components/HoldingRow";
import { PortfolioSummary } from "@/components/screens/PortfolioSummary";
import { SectionHeader } from "@/components/SectionHeader";
import { TopBar } from "@/components/TopBar";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { PageTabs, type PageTab } from "@/components/ui/PageTabs";
import { HOLDINGS } from "@/lib/portfolio";

const TABS: ReadonlyArray<PageTab> = [
  { id: "all", label: "All Portfolio" },
  { id: "via-signals", label: "Via Signals" },
];

export default function PortfolioPage() {
  const [tab, setTab] = useState(TABS[0].id);

  return (
    <AppShell className="bg-surface-alt">
      <TopBar showBack backHref="/chats" />

      <div className="shrink-0 bg-surface px-[43px] pt-[16px]">
        <PageTabs label="Portfolio filter" tabs={TABS} value={tab} onChange={setTab} />
      </div>

      <PortfolioSummary />

      <SectionHeader
        className="mt-[24px] shrink-0 px-[24px]"
        icon={{ src: "/assets/icon-clear-all.svg", width: 15.75, height: 8.75 }}
        title="My Stocks"
        action={
          <a href="/portfolio/add" className="flex items-center gap-[7px] text-muted">
            <span className="flex size-[17px] items-center justify-center">
              <MaskIcon src="/assets/icon-add-box.svg" width={12.75} height={12.75} />
            </span>
            <span className="text-[12px] font-semibold uppercase">Add Stock</span>
          </a>
        }
      />

      <div className="mt-[19px] flex-1 bg-surface pt-[9px]">
        <ul className="flex flex-col gap-[13px]">
          {HOLDINGS.map((holding) => (
            <HoldingRow key={holding.id} holding={holding} />
          ))}
        </ul>
      </div>

      <BottomNav />
    </AppShell>
  );
}
