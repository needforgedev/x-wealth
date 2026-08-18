import { MaskIcon } from "@/components/ui/MaskIcon";

type StepCheckProps = {
  /** `done` is the blue tick beside a title; `valid` is the green field tick. */
  tone?: "done" | "valid";
  label: string;
  className?: string;
};

const TONES = {
  done: "bg-step-check",
  valid: "bg-positive",
} as const;

/** Filled circle with a white check — marks a completed step or a valid field. */
export function StepCheck({ tone = "done", label, className = "" }: StepCheckProps) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`flex size-[20px] shrink-0 items-center justify-center rounded-full text-white ${TONES[tone]} ${className}`}
    >
      <MaskIcon src="/assets/icon-check.svg" width={9.75} height={7.43} />
    </span>
  );
}
