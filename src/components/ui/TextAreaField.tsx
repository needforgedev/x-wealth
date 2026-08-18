"use client";

import { useState, type ComponentProps } from "react";

type TextAreaFieldProps = Omit<ComponentProps<"textarea">, "defaultValue"> & {
  label: string;
  defaultValue?: string;
  /** Shows a remaining-character count in the bottom-right of the box. */
  limit?: number;
  containerClassName?: string;
  /** Override the 72px default height, e.g. the 142px Notes box. */
  height?: number;
};

/**
 * Uppercase label above a bordered multi-line box. The counter sits inside the
 * box on the artboard rather than below it, so the textarea reserves room for
 * it instead of the counter pushing the next field down.
 */
export function TextAreaField({
  label,
  defaultValue = "",
  limit,
  containerClassName = "",
  height = 72,
  className = "",
  id,
  ...props
}: TextAreaFieldProps) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const [value, setValue] = useState(defaultValue);

  return (
    <div className={containerClassName}>
      <label
        htmlFor={fieldId}
        className="block text-[13px] font-medium uppercase text-muted"
      >
        {label}
      </label>

      <div className="relative mt-[10px]">
        <textarea
          id={fieldId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={limit}
          style={{ height }}
          className={`w-full resize-none rounded-[4px] border border-line bg-transparent px-5 pt-[17px] pb-[22px] text-[15px] text-ink outline-none placeholder:text-muted focus:border-brand ${className}`}
          {...props}
        />
        {limit != null && (
          <span className="pointer-events-none absolute bottom-[7px] right-[15px] text-[12px] text-counter">
            {limit - value.length}
          </span>
        )}
      </div>
    </div>
  );
}
