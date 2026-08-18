"use client";

import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { HoldingRow } from "@/components/HoldingRow";
import { PortfolioSummary } from "@/components/screens/PortfolioSummary";
import { SectionHeader } from "@/components/SectionHeader";
import { TopBar } from "@/components/TopBar";
import { HOLDINGS } from "@/lib/portfolio";

const GROUPS = ["Group 1", "Group 2", "Group 3", "New Group"] as const;

/** My Portfolio filtered by signal group (742:1317). */
export default function PortfolioGroupsPage() {
  const [group, setGroup] = useState<string>(GROUPS[0]);

  return (
    <AppShell className="bg-surface-alt">
      <TopBar showBack backHref="/portfolio" />
      <PortfolioSummary />

      <SectionHeader
        className="mt-[24px] shrink-0 px-[24px]"
        icon={{ src: "/assets/icon-clear-all.svg", width: 15.75, height: 8.75 }}
        title="My Stocks"
        action={
          <span className="text-[12px] font-semibold uppercase text-muted">Add Stock</span>
        }
      />

      <div
        role="tablist"
        aria-label="Signal group"
        className="no-scrollbar mt-[32px] flex shrink-0 gap-[8px] overflow-x-auto px-[24px]"
      >
        {GROUPS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === group}
            onClick={() => setGroup(item)}
            className={`shrink-0 text-[12px] font-semibold uppercase whitespace-nowrap ${
              item === group ? "text-black" : "text-muted"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-[27px] flex-1 bg-surface pt-[9px]">
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
