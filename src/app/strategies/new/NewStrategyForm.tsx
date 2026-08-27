"use client";

import { useRouter } from "next/navigation";

import { StrategyForm } from "@/components/advisor/StrategyForm";
import { starterDefinition, type InstrumentChoice } from "@/domain/strategy";
import { createStrategy } from "@/server/actions/strategy";

export function NewStrategyForm({ catalogue }: { catalogue: InstrumentChoice[] }) {
  const router = useRouter();

  return (
    <StrategyForm
      submitLabel="Save strategy"
      catalogue={catalogue}
      initial={{
        name: "",
        description: "",
        hypothesis: "",
        definition: starterDefinition(),
      }}
      onSubmit={async (values) => {
        const result = await createStrategy(values);
        if (!result.ok) return result.error;
        router.push(`/strategies/${result.data.strategyId}`);
        return null;
      }}
    />
  );
}
