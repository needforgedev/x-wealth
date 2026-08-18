"use client";

import { useState } from "react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { SegmentedTabs, type SegmentedTab } from "@/components/ui/SegmentedTabs";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { SIGNAL_DRAFT } from "@/lib/advisor";
import type { SignalSide } from "@/lib/signals";

const SIDES: ReadonlyArray<SegmentedTab> = [
  { id: "buy", label: "Buy" },
  { id: "sell", label: "Sell" },
];

/**
 * Bottom sheet the advisor composes a call in. The artboards draw it at three
 * heights — the short one stops after the targets, the tall one adds Notes —
 * so the panel caps at 88% of the viewport and scrolls the fields inside.
 */
export function SendSignalSheet({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend?: (side: SignalSide) => void;
}) {
  const [side, setSide] = useState<SignalSide>("buy");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Send signal"
        className="relative mt-auto flex max-h-[88dvh] w-full max-w-app flex-col bg-surface"
      >
        <SegmentedTabs
          className="shrink-0"
          label="Signal side"
          tabs={SIDES}
          value={side}
          onChange={(id) => setSide(id as SignalSide)}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-[26px] pt-[26px] pb-[22px]">
          <TextField
            label="Stock Ticker"
            trailing="chevron"
            readOnly
            defaultValue={SIGNAL_DRAFT.ticker}
          />

          <div className="mt-[10px] grid grid-cols-2 gap-x-[9px]">
            <TextField label="Entry Price" trailing="unfold" defaultValue={SIGNAL_DRAFT.entry} />
            <TextField label="Exit Price" trailing="unfold" defaultValue={SIGNAL_DRAFT.exit} />
          </div>

          <div className="mt-[19px] grid grid-cols-2 gap-x-[9px]">
            <TextField
              label="Start Date"
              trailing="chevron"
              readOnly
              defaultValue={SIGNAL_DRAFT.startDate}
            />
            <TextField
              label="End Date"
              trailing="chevron"
              readOnly
              defaultValue={SIGNAL_DRAFT.endDate}
            />
          </div>

          <div className="mt-[19px] grid grid-cols-3 gap-x-[14px]">
            {SIGNAL_DRAFT.targets.map((target, index) => (
              <TextField key={index} label={`T${index + 1}`} defaultValue={target} />
            ))}
          </div>

          <TextAreaField
            containerClassName="mt-[19px]"
            label="Notes"
            height={142}
            defaultValue={SIGNAL_DRAFT.notes}
          />

          <PrimaryButton
            className="mt-[22px]"
            onClick={() => {
              onSend?.(side);
              onClose();
            }}
          >
            Send Signal
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
