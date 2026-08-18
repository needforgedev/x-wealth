"use client";

import type { ReactNode } from "react";

type ChipProps = {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
};

/** Toggleable pill used for interest/preference selection. */
export function Chip({ selected, onToggle, children, className = "" }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`h-[45px] rounded-[4px] border px-[19px] text-[16px] font-medium capitalize transition-colors ${
        selected
          ? "border-chip bg-chip text-white"
          : "border-chip-idle bg-[#f4f4f4]/10 text-chip-idle"
      } ${className}`}
    >
      {children}
    </button>
  );
}
