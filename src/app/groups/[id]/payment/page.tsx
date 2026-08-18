"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { GroupIdentityRow } from "@/components/GroupIdentityRow";
import { SectionHeader } from "@/components/SectionHeader";
import { TopBar } from "@/components/TopBar";
import { RadioCardGroup } from "@/components/ui/RadioCardGroup";
import { GROUP } from "@/lib/conversation";
import { PLANS } from "@/lib/subscription";

const TAXES = "₹158 INR";
const TOTAL = "₹3459 INR";

function Row({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[17px] font-medium tracking-[-0.21px] text-[#8d8d8d]">{label}</span>
      <span
        className={`tracking-[-0.21px] ${
          emphasis ? "text-[17px] font-semibold text-black" : "text-[17px] font-medium text-[#8d8d8d]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function GroupPaymentPage({ params }: PageProps<"/groups/[id]/payment">) {
  const { id } = use(params);
  const router = useRouter();
  const [plan, setPlan] = useState(PLANS[0].id);

  return (
    <AppShell className="bg-surface-alt">
      <TopBar showBack backHref={`/groups/${id}/profile`} />

      <div className="shrink-0 bg-surface px-[27px] pt-[20px] pb-[33px]">
        <GroupIdentityRow name={GROUP.name} members={GROUP.members} tint={GROUP.tint} />
      </div>

      <SectionHeader
        className="mt-[84px] shrink-0 px-[29px]"
        icon={{ src: "/assets/icon-credit-card.svg", width: 17.5, height: 14 }}
        title="Choose Plan"
      />

      <section className="mx-[28px] mt-[18px] shrink-0 bg-surface px-[17px] py-[16px]">
        <RadioCardGroup
          name="plan"
          label="Subscription plan"
          size="compact"
          options={PLANS}
          value={plan}
          onChange={setPlan}
        />
      </section>

      <section className="mt-auto shrink-0 bg-surface px-[22px] pt-[28px] pb-[calc(8px+env(safe-area-inset-bottom))]">
        <Row label="Taxes" value={TAXES} />
        <div className="mt-[16px]">
          <Row label="Total" value={TOTAL} emphasis />
        </div>

        <button
          type="button"
          onClick={() => router.push(`/groups/${id}/payment/success`)}
          className="mt-[25px] h-[48px] w-full rounded-[6px] bg-brand text-[17px] font-semibold text-white"
        >
          Add Payment
        </button>

        <Image
          src="/assets/payment-methods.png"
          alt="Accepted payment methods"
          width={331}
          height={53}
          className="mt-[16px] h-[53px] w-full object-contain"
        />
      </section>
    </AppShell>
  );
}
