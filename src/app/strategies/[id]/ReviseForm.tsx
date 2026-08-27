"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StrategyForm } from "@/components/advisor/StrategyForm";
import { upgradeToV2, type InstrumentChoice, type StrategyDefinition } from "@/domain/strategy";
import { reviseStrategy } from "@/server/actions/strategy";

export function ReviseForm({
  strategyId,
  name,
  description,
  hypothesis,
  definition,
  catalogue,
}: {
  strategyId: string;
  name: string;
  description: string;
  hypothesis: string;
  definition: StrategyDefinition;
  catalogue: InstrumentChoice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [changeNote, setChangeNote] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[44px] w-full rounded-[4px] border border-line text-[15px] font-semibold text-ink"
      >
        Revise into a new version
      </button>
    );
  }

  return (
    <div>
      <p className="mb-4 rounded-[6px] bg-surface-alt p-3 text-[13px] text-muted">
        This adds a version. The current one stays on the record permanently — nothing is
        overwritten, and nothing can be removed later.
      </p>
      <StrategyForm
        showIdentity={false}
        submitLabel="Save new version"
        catalogue={catalogue}
        changeNote={changeNote}
        onChangeNote={setChangeNote}
        initial={{ name, description, hypothesis, definition: upgradeToV2(definition) }}
        onSubmit={async (values) => {
          const result = await reviseStrategy({
            strategyId,
            hypothesis: values.hypothesis,
            changeNote,
            definition: values.definition,
          });
          if (!result.ok) return result.error;
          setOpen(false);
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
