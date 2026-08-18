"use client";

import { useState } from "react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";

function Field({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  const id = `atp-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[13px] font-medium uppercase text-muted">
        {label}
      </label>
      <input
        id={id}
        defaultValue={value}
        className="mt-[10px] h-[32px] w-full border-b border-line bg-transparent text-[15px] text-ink outline-none focus:border-brand"
      />
    </div>
  );
}

const ACTIONS = ["Buy", "Sell"] as const;

/**
 * Sheet for adding a holding, shown over My Portfolio and over a group chat.
 * The artboards only pin the fields and CTA, so the sheet container itself is
 * laid out to those positions rather than to an explicit background rect.
 */
export function AddToPortfolioSheet({ onSubmitHref }: { onSubmitHref?: string }) {
  const [action, setAction] = useState<string>(ACTIONS[0]);

  return (
    <section className="shrink-0 rounded-t-[12px] bg-surface px-[26px] pt-[24px] pb-[calc(21px+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_0_rgb(0_0_0/0.08)]">
      <Field label="Stock Ticker" value="HDFC BANK" />

      <div className="mt-[24px] flex gap-[40px]">
        <Field label="Stock Price" value="1345.46" className="flex-1" />
        <Field label="Quanity" value="354" className="w-[103px]" />
      </div>

      <div className="mt-[24px]">
        <p className="text-[13px] font-medium uppercase text-muted">Action</p>
        <div role="radiogroup" aria-label="Action" className="mt-[10px] flex gap-[12px]">
          {ACTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={action === option}
              onClick={() => setAction(option)}
              className={`h-[34px] flex-1 rounded-[4px] border text-[15px] font-medium ${
                action === option
                  ? "border-brand bg-brand text-white"
                  : "border-line text-muted"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <Field label="Transaction Date" value="19-08-2021" className="mt-[24px]" />

      <PrimaryButton className="mt-[30px]" onClick={() => onSubmitHref && (window.location.href = onSubmitHref)}>
        Add to Portfolio
      </PrimaryButton>
    </section>
  );
}
