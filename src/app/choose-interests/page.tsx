"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { Chip } from "@/components/ui/Chip";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

/**
 * Order and labels mirror the artboard exactly — note the design repeats
 * several labels (Intraday x3, Forex x3, Day Trading x2, Long Term x2), so each
 * chip carries a unique id and toggles independently.
 */
const INTERESTS = [
  { id: "bank-nifty", label: "Bank NIFTY" },
  { id: "intraday-1", label: "Intraday" },
  { id: "forex-1", label: "Forex" },
  { id: "day-trading-1", label: "Day Trading" },
  { id: "long-term-1", label: "Long Term" },
  { id: "intraday-2", label: "Intraday" },
  { id: "day-trading-2", label: "Day Trading" },
  { id: "forex-2", label: "Forex" },
  { id: "forex-3", label: "Forex" },
  { id: "long-term-2", label: "Long Term" },
  { id: "intraday-3", label: "Intraday" },
] as const;

export default function ChooseInterestsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(["bank-nifty"]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <AppShell>
      <AppBar backHref="/onboarding-questions" />

      <div className="flex flex-1 flex-col px-5">
        <h1 className="mt-[50px] text-center text-[20px] font-semibold capitalize text-ink">
          Select Preferences
        </h1>
        <p className="mt-[6px] text-center text-[18px] text-muted">with using our app?</p>

        <div className="mt-[91px] flex flex-wrap gap-x-[12px] gap-y-[14px]">
          {INTERESTS.map(({ id, label }) => (
            <Chip key={id} selected={selected.includes(id)} onToggle={() => toggle(id)}>
              {label}
            </Chip>
          ))}
        </div>

        <PrimaryButton
          className="mt-auto mb-[calc(29px+env(safe-area-inset-bottom))]"
          onClick={() => router.push("/group-invitations")}
        >
          Continue
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
