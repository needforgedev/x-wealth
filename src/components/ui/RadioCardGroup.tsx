"use client";

import Image from "next/image";

export type RadioCardOption = {
  id: string;
  title: string;
  description: string;
};

type RadioCardGroupProps = {
  name: string;
  label: string;
  options: ReadonlyArray<RadioCardOption>;
  value: string;
  onChange: (id: string) => void;
  /** `compact` is the shorter card used for subscription plans. */
  size?: "default" | "compact";
  className?: string;
};

const SIZES = {
  default: {
    card: "h-[64px] pl-[14px] pr-5",
    title: "text-[17px]",
    description: "text-[16px] mt-[5px]",
    icon: "size-[21.67px]",
  },
  compact: {
    card: "h-[56px] pl-[12px] pr-[16px]",
    title: "text-[14px]",
    description: "text-[14px] mt-[8px]",
    icon: "size-[22.38px]",
  },
} as const;

/**
 * Stack of selectable cards, one radio each. The selected card takes a brand
 * border; the rest use the stronger neutral rule.
 */
export function RadioCardGroup({
  name,
  label,
  options,
  value,
  onChange,
  size = "default",
  className = "",
}: RadioCardGroupProps) {
  const styles = SIZES[size];

  return (
    <div role="radiogroup" aria-label={label} className={`flex flex-col gap-[10px] ${className}`}>
      {options.map((option) => {
        const isSelected = option.id === value;
        return (
          <label
            key={option.id}
            className={`relative flex cursor-pointer items-center rounded-[3px] border ${styles.card} ${
              isSelected ? "border-brand" : "border-line-strong"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={isSelected}
              onChange={() => onChange(option.id)}
              className="sr-only"
            />

            <span className="min-w-0 flex-1">
              <span className={`block truncate font-medium capitalize text-ink ${styles.title}`}>
                {option.title}
              </span>
              <span className={`block truncate text-muted ${styles.description}`}>
                {option.description}
              </span>
            </span>

            <Image
              src={isSelected ? "/assets/icon-radio-checked.svg" : "/assets/icon-radio-unchecked.svg"}
              alt=""
              width={22}
              height={22}
              unoptimized
              className={`ml-3 shrink-0 ${styles.icon}`}
            />
          </label>
        );
      })}
    </div>
  );
}
