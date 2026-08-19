"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { Chip } from "@/components/ui/Chip";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { saveInterests } from "@/server/actions/investor";

/**
 * The artboard repeats several labels; the stored value is the label, so the
 * list here is deduplicated rather than reproducing the duplicates.
 */
const INTERESTS = [
  "Bank NIFTY",
  "Intraday",
  "Forex",
  "Day Trading",
  "Long Term",
  "NIFTY 50",
  "Swing Trading",
  "Commodities",
] as const;

export function InterestsForm({
  initial,
  nextHref,
}: {
  initial: string[];
  nextHref: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const toggle = (label: string) =>
    setSelected((current) =>
      current.includes(label) ? current.filter((i) => i !== label) : [...current, label],
    );

  return (
    <AppShell>
      <AppBar backHref="/onboarding-questions" />

      <div className="flex flex-1 flex-col px-5">
        <h1 className="mt-[50px] text-center text-[20px] font-semibold capitalize text-ink">
          Select Preferences
        </h1>
        <p className="mt-[6px] text-center text-[18px] text-muted">so we can show relevant work</p>

        <div className="mt-[91px] flex flex-wrap gap-x-[12px] gap-y-[14px]">
          {INTERESTS.map((label) => (
            <Chip key={label} selected={selected.includes(label)} onToggle={() => toggle(label)}>
              {label}
            </Chip>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-center text-[14px] text-danger-ink">
            {error}
          </p>
        )}

        <PrimaryButton
          className="mt-auto mb-[calc(29px+env(safe-area-inset-bottom))]"
          disabled={pending}
          onClick={async () => {
            setError(null);
            setPending(true);
            const result = await saveInterests(selected);
            setPending(false);
            if (!result.ok) return setError(result.error);
            router.push(nextHref);
          }}
        >
          {pending ? "Saving…" : "Continue"}
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
