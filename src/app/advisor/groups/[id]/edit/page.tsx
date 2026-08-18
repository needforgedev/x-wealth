"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { GroupFormFields } from "@/components/advisor/GroupFormFields";
import { MemberRow } from "@/components/advisor/MemberRow";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { PageTabs, type PageTab } from "@/components/ui/PageTabs";
import { RadioCardGroup } from "@/components/ui/RadioCardGroup";
import { ADVISOR_TIERS, MEMBERS } from "@/lib/advisor";

const TABS: ReadonlyArray<PageTab> = [
  { id: "main", label: "Main Info" },
  { id: "members", label: "Members" },
  { id: "billing", label: "Billing" },
];

/**
 * Group settings. The Figma draws two versions of this screen — one plain and
 * one with the Main Info / Members / Billing tabs — so this builds the tabbed
 * one and renders Main Info as its default panel.
 *
 * Only Main Info is drawn in the file. Members and Billing reuse the roster and
 * tier cards designed elsewhere in the advisor flow rather than inventing new
 * layouts for them.
 */
export default function AdvisorEditGroupPage({ params }: PageProps<"/advisor/groups/[id]/edit">) {
  const { id } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState(TABS[0].id);
  const [tier, setTier] = useState(ADVISOR_TIERS[0].id);

  return (
    <AppShell className="bg-surface">
      <TopBar showBack backHref={`/advisor/groups/${id}/profile`} />

      <div className="flex shrink-0 items-center px-[26px] pt-[25px]">
        <h1 className="text-[16px] font-semibold capitalize text-editing-ink">
          Editing Group Info
        </h1>
        <button
          type="button"
          onClick={() => router.push(`/advisor/groups/${id}/profile`)}
          className="ml-auto text-[16px] font-semibold uppercase text-brand"
        >
          Save
        </button>
      </div>

      <div className="mt-[24px] shrink-0 px-[24px]">
        <PageTabs label="Group settings" tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "main" && (
        <div className="flex flex-1 flex-col px-[19px] pt-[26px] pb-[calc(24px+env(safe-area-inset-bottom))]">
          <GroupFormFields />

          <button
            type="button"
            className="mt-[32px] h-[47px] w-full rounded-[3px] bg-danger/10 text-[15px] uppercase text-danger-ink"
          >
            Delete group
          </button>
        </div>
      )}

      {tab === "members" && (
        <ul className="flex flex-1 flex-col gap-[24px] px-[34px] pt-[26px] pb-6">
          {MEMBERS.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </ul>
      )}

      {tab === "billing" && (
        <div className="flex-1 px-[36px] pt-[26px] pb-6">
          <RadioCardGroup
            name="tier"
            label="Pricing tier"
            size="compact"
            options={ADVISOR_TIERS}
            value={tier}
            onChange={setTier}
          />
        </div>
      )}
    </AppShell>
  );
}
