import Image from "next/image";
import type { ComponentProps } from "react";

/** `chevron` opens a picker; `unfold` is the stepper on the price fields. */
type Trailing = "chevron" | "unfold";

const TRAILING_ICONS = {
  chevron: { src: "/assets/icon-chevron-down.svg", width: 12, height: 7.41 },
  unfold: { src: "/assets/icon-unfold-more.svg", width: 10, height: 14 },
} as const;

type TextFieldProps = Omit<ComponentProps<"input">, "size"> & {
  label: string;
  /** Adornment shown on the right edge of the field. */
  trailing?: Trailing;
  containerClassName?: string;
};

/** Uppercase label above a 51px bordered input. The standard field across all forms. */
export function TextField({
  label,
  trailing,
  containerClassName = "",
  className = "",
  id,
  ...props
}: TextFieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const icon = trailing ? TRAILING_ICONS[trailing] : null;

  return (
    <div className={containerClassName}>
      <label
        htmlFor={inputId}
        className="block text-[13px] font-medium uppercase text-muted"
      >
        {label}
      </label>

      <div className="relative mt-[10px]">
        <input
          id={inputId}
          className={`h-[51px] w-full rounded-[4px] border border-line bg-transparent pl-5 text-[15px] text-ink outline-none placeholder:text-muted focus:border-brand ${
            icon ? "pr-11" : "pr-5"
          } ${className}`}
          {...props}
        />
        {icon && (
          <Image
            src={icon.src}
            alt=""
            width={icon.width}
            height={icon.height}
            unoptimized
            style={{ width: icon.width, height: icon.height }}
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
          />
        )}
      </div>
    </div>
  );
}
