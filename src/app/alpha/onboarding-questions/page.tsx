"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { Chip } from "@/components/ui/Chip";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TextField } from "@/components/ui/TextField";
import { ALPHA_INTERESTS, EXPERIENCE_LEVELS } from "@/lib/alpha";

/**
 * Alpha folds what the Investor page splits across two screens — the goal
 * question and the interest picker — into one step, with experience captured as
 * a select rather than a stack of radio cards.
 */
export default function AlphaOnboardingQuestionsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(["bank-nifty"]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <AppShell>
      <AppBar backHref="/alpha/complete-profile" />

      <div className="flex flex-1 flex-col px-5">
        <h1 className="mt-[50px] text-center text-[20px] font-semibold text-ink">
          What&rsquo;s your goal
        </h1>
        <p className="mt-[6px] text-center text-[18px] text-muted">with using our app?</p>

        <TextField
          containerClassName="mt-[64px]"
          label="Trading Experience"
          labelCase="normal"
          trailing="chevron"
          readOnly
          defaultValue={EXPERIENCE_LEVELS[0]}
        />

        <p className="mt-[42px] text-[13px] font-medium text-muted">Select Interests</p>

        <div className="mt-[17px] flex flex-wrap gap-x-[11px] gap-y-[13px]">
          {ALPHA_INTERESTS.map(({ id, label }) => (
            <Chip
              key={id}
              variant="tint"
              selected={selected.includes(id)}
              onToggle={() => toggle(id)}
            >
              {label}
            </Chip>
          ))}
        </div>

        <PrimaryButton
          className="mt-auto mb-[calc(29px+env(safe-area-inset-bottom))]"
          onClick={() => router.push("/alpha/join-groups")}
        >
          Continue
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
