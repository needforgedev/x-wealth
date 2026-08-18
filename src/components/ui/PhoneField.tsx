"use client";

import Image from "next/image";

type PhoneFieldProps = {
  dialCode?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  onDialCodeClick?: () => void;
  className?: string;
};

/**
 * Phone number entry: a country-code button, a hairline divider, then the number
 * input — all inside a single 51px bordered box.
 */
export function PhoneField({
  dialCode = "+91",
  value,
  onValueChange,
  onDialCodeClick,
  className = "",
}: PhoneFieldProps) {
  return (
    <div
      className={`flex h-[51px] w-full items-stretch rounded-[4px] border border-line focus-within:border-brand ${className}`}
    >
      <button
        type="button"
        onClick={onDialCodeClick}
        aria-label={`Country calling code, currently ${dialCode}`}
        className="flex w-[75px] shrink-0 items-center gap-[6px] pl-3 text-[15px] text-muted"
      >
        {dialCode}
        <Image
          src="/assets/icon-chevron-down.svg"
          alt=""
          width={12}
          height={7}
          unoptimized
          className="h-[7.41px] w-[12px]"
        />
      </button>

      <span aria-hidden className="my-px w-px shrink-0 bg-line" />

      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        aria-label="Mobile number"
        placeholder="9757242802"
        value={value}
        onChange={(e) => onValueChange?.(e.target.value.replace(/\D/g, ""))}
        className="min-w-0 flex-1 rounded-r-[4px] bg-transparent pl-[26px] pr-3 text-[15px] text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}
