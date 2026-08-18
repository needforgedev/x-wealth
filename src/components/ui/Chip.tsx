"use client";

import type { ReactNode } from "react";

type ChipProps = {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  /**
   * `solid` is the filled selection on Choose Interests. `tint` is the Alpha
   * treatment — a brand wash behind brand-tinted text rather than white on
   * solid — and sits 2px shorter.
   */
  variant?: "solid" | "tint";
  className?: string;
};

const SELECTED = {
  solid: "border-chip bg-chip text-white",
  tint: "border-brand bg-brand/[0.23] text-[#556ad3]",
} as const;

/** Toggleable pill used for interest/preference selection. */
export function Chip({
  selected,
  onToggle,
  children,
  variant = "solid",
  className = "",
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`rounded-[4px] border px-[19px] text-[16px] font-medium capitalize transition-colors ${
        variant === "tint" ? "h-[43px]" : "h-[45px]"
      } ${
        selected ? SELECTED[variant] : "border-chip-idle bg-[#f4f4f4]/10 text-chip-idle"
      } ${className}`}
    >
      {children}
    </button>
  );
}
