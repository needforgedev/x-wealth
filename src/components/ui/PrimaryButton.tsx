import type { ComponentProps } from "react";

type PrimaryButtonProps = ComponentProps<"button"> & {
  /** `inverse` is the white-on-brand treatment used on brand-filled screens. */
  variant?: "brand" | "inverse";
};

const VARIANTS = {
  brand: "bg-brand text-white",
  inverse: "bg-surface text-brand",
} as const;

/** Full-width CTA — 53px tall, 4px radius. */
export function PrimaryButton({
  className = "",
  type = "button",
  variant = "brand",
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      className={`h-[53px] w-full rounded-[4px] text-[16px] font-semibold transition-opacity active:opacity-90 disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
