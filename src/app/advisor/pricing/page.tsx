"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { RadioCardGroup } from "@/components/ui/RadioCardGroup";
import { StepCheck } from "@/components/ui/StepCheck";
import { Toggle } from "@/components/ui/Toggle";
import { ADVISOR_TIERS } from "@/lib/advisor";

/** Label on the left, switch on the right — the two access rules on this screen. */
function RuleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex h-[37px] items-center">
      <span className="min-w-0 flex-1 text-[15px] font-medium text-muted">{label}</span>
      <Toggle label={label} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function AdvisorPricingPage() {
  const router = useRouter();
  const [openInvites, setOpenInvites] = useState(true);
  const [paidGroup, setPaidGroup] = useState(true);
  const [tier, setTier] = useState(ADVISOR_TIERS[0].id);

  return (
    <AppShell>
      <AppBar backHref="/advisor/create-group" />

      <div className="flex flex-1 flex-col pb-[calc(29px+env(safe-area-inset-bottom))]">
        <div className="mt-[50px] flex items-center justify-center gap-[11px]">
          <StepCheck label="Group created" />
          <h1 className="text-[20px] font-semibold capitalize text-ink">Pricing Tiers</h1>
        </div>
        <p className="mt-[6px] text-center text-[18px] text-muted">How do you want to charge?</p>

        <div className="mt-[36px] flex flex-col gap-[8px] px-[30px]">
          <RuleRow
            label="Anyone can invite their friends"
            checked={openInvites}
            onCheckedChange={setOpenInvites}
          />
          <RuleRow label="Paid Group" checked={paidGroup} onCheckedChange={setPaidGroup} />
        </div>

        <div className="mt-[24px] h-px bg-line" />

        <div className="mt-[24px] px-[36px]">
          <RadioCardGroup
            name="tier"
            label="Pricing tier"
            size="compact"
            options={ADVISOR_TIERS}
            value={tier}
            onChange={setTier}
          />

          <button
            type="button"
            className="mt-[10px] flex h-[56px] w-full items-center rounded-[3px] bg-[#f1f1f1] pl-[12px] pr-[16px]"
          >
            <span className="min-w-0 flex-1 text-center text-[15px] font-medium text-muted">
              Add new pricing tier
            </span>
            <span className="ml-3 flex size-[22px] shrink-0 items-center justify-center text-muted">
              <MaskIcon src="/assets/icon-add.svg" width={13} height={13} />
            </span>
          </button>
        </div>

        <div className="mt-auto px-[26px] pt-[24px]">
          <PrimaryButton onClick={() => router.push("/advisor/chats")}>Continue</PrimaryButton>
        </div>
      </div>
    </AppShell>
  );
}
