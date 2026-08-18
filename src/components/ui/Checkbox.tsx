"use client";

import Image from "next/image";
import { useId, type ReactNode } from "react";

type CheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
  className?: string;
};

/**
 * Checkbox with inline label. The checked mark is the Figma export; the
 * unchecked state is an outlined square of the same 13.5px footprint, so
 * toggling never shifts the label.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  children,
  className = "",
}: CheckboxProps) {
  const id = useId();

  return (
    <div className={`flex gap-[13px] ${className}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="sr-only"
      />
      <label
        htmlFor={id}
        className="mt-[6px] flex size-[13.5px] shrink-0 cursor-pointer items-center justify-center"
      >
        {checked ? (
          <Image
            src="/assets/icon-checkbox.svg"
            alt=""
            width={14}
            height={14}
            unoptimized
            className="size-[13.5px]"
          />
        ) : (
          <span className="size-[13.5px] rounded-[2px] border border-muted" />
        )}
      </label>
      <label htmlFor={id} className="cursor-pointer text-[14px] text-muted">
        {children}
      </label>
    </div>
  );
}
