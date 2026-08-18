"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { JoinGroupRow } from "@/components/alpha/JoinGroupRow";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { JOINABLE_GROUPS, JOIN_FILTERS } from "@/lib/alpha";

/**
 * A step the Investor flow doesn't have: pick a group before landing in the
 * app, so the home screen is never empty on first run.
 */
export default function AlphaJoinGroupsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<string>(JOIN_FILTERS[0]);
  const [joined, setJoined] = useState<string[]>([JOINABLE_GROUPS[0].id]);

  const toggle = (id: string) =>
    setJoined((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <AppShell className="bg-surface-alt">
      <AppBar backHref="/alpha/onboarding-questions" />

      <h1 className="mt-[50px] text-center text-[20px] font-semibold text-ink">
        Join first group
      </h1>
      <p className="mt-[6px] text-center text-[18px] text-muted">to receive updates</p>

      <section className="mt-[62px] flex flex-1 flex-col bg-surface">
        <div
          role="tablist"
          aria-label="Group categories"
          className="no-scrollbar flex shrink-0 gap-[18px] overflow-x-auto border-b border-[#dfdfdf] px-[30px]"
        >
          {JOIN_FILTERS.map((item) => {
            const isActive = item === filter;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilter(item)}
                className={`shrink-0 border-b-[1.5px] pb-[13px] pt-[9px] text-[14px] font-medium capitalize ${
                  isActive ? "border-[#343333] text-black" : "border-transparent text-[#a7a7a7]"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>

        <ul className="flex flex-col gap-[29px] px-[30px] pt-[29px]">
          {JOINABLE_GROUPS.map((group) => (
            <JoinGroupRow
              key={group.id}
              group={group}
              selected={joined.includes(group.id)}
              onToggle={() => toggle(group.id)}
            />
          ))}
        </ul>

        <div className="px-5 pt-8 pb-[calc(29px+env(safe-area-inset-bottom))]">
          <PrimaryButton onClick={() => router.push("/alpha/chats")}>Continue</PrimaryButton>
        </div>
      </section>
    </AppShell>
  );
}
