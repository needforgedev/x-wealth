"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { RadioCardGroup, type RadioCardOption } from "@/components/ui/RadioCardGroup";
import { saveExperienceLevel } from "@/server/actions/profile";

/** Ids are the database enum values, so nothing has to translate between them. */
const GOALS: ReadonlyArray<RadioCardOption> = [
  { id: "BEGINNER", title: "Beginner", description: "Just checking the app out" },
  { id: "INTERMEDIATE", title: "Intermediate", description: "Mitigate your risk and more" },
  { id: "EXPERT", title: "Expert", description: "I invest often and track markets" },
  { id: "SUPER_PRO", title: "Super Pro", description: "I know what I am doing" },
];

export function ExperienceForm({
  initial,
  nextHref,
}: {
  initial: string | null;
  nextHref: string;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState(initial ?? GOALS[0].id);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <AppShell>
      <AppBar backHref="/complete-profile" />

      <div className="flex flex-1 flex-col px-5">
        <h1 className="mt-[50px] text-center text-[20px] font-semibold capitalize text-ink">
          What&rsquo;s your goal
        </h1>
        <p className="mt-[6px] text-center text-[18px] text-muted">with using our app?</p>

        <RadioCardGroup
          className="mt-[79px]"
          name="goal"
          label="What's your goal with using our app?"
          options={GOALS}
          value={goal}
          onChange={setGoal}
        />

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
            const result = await saveExperienceLevel(goal);
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
