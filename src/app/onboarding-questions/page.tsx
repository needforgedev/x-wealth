"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { RadioCardGroup, type RadioCardOption } from "@/components/ui/RadioCardGroup";

const GOALS: ReadonlyArray<RadioCardOption> = [
  { id: "beginner", title: "Beginner", description: "Just checking the app out" },
  { id: "intermediate", title: "Intermediate", description: "Mitigate your risk and more" },
  { id: "expert", title: "Expert", description: "I invest often and track markets" },
  { id: "super-pro", title: "Super Pro", description: "I know what I am doing" },
];

export default function OnboardingQuestionsPage() {
  const router = useRouter();
  const [goal, setGoal] = useState(GOALS[0].id);

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

        <PrimaryButton
          className="mt-auto mb-[calc(29px+env(safe-area-inset-bottom))]"
          onClick={() => router.push("/choose-interests")}
        >
          Continue
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
