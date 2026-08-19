"use client";

import { useRouter } from "next/navigation";

import { StrategyForm } from "@/components/advisor/StrategyForm";
import { starterDefinition } from "@/domain/strategy";
import { createStrategy } from "@/server/actions/strategy";

export function NewStrategyForm() {
  const router = useRouter();

  return (
    <StrategyForm
      submitLabel="Save strategy"
      initial={{
        name: "",
        description: "",
        hypothesis: "",
        definition: starterDefinition(),
      }}
      onSubmit={async (values) => {
        const result = await createStrategy(values);
        if (!result.ok) return result.error;
        router.push(`/advisor/strategies/${result.data.strategyId}`);
        return null;
      }}
    />
  );
}
