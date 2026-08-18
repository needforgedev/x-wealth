"use client";

import { useRef, useState, type KeyboardEvent } from "react";

type OtpInputProps = {
  length?: number;
  onChange?: (code: string) => void;
  autoFocus?: boolean;
  className?: string;
};

/**
 * One-time-code entry. Each digit is its own cell with an underline — 2px brand
 * on the focused cell, 1px muted otherwise. Handles auto-advance, backspace to
 * the previous cell, arrow keys, and pasting a full code into any cell.
 */
export function OtpInput({
  length = 4,
  onChange,
  autoFocus = true,
  className = "",
}: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const [focused, setFocused] = useState<number | null>(autoFocus ? 0 : null);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const commit = (next: string[]) => {
    setDigits(next);
    onChange?.(next.join(""));
  };

  const handleChange = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    const next = [...digits];

    if (!typed) {
      next[index] = "";
      commit(next);
      return;
    }

    // A paste can carry the whole code — spread it across the remaining cells.
    for (let i = 0; i < typed.length && index + i < length; i++) {
      next[index + i] = typed[i];
    }
    commit(next);
    refs.current[Math.min(index + typed.length, length - 1)]?.focus();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      commit(next);
      refs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  };

  return (
    <div className={`flex justify-center gap-[22px] ${className}`}>
      {digits.map((digit, index) => (
        <div key={index} className="relative h-[48px] w-[53px]">
          <input
            ref={(el) => {
              refs.current[index] = el;
            }}
            value={digit}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={length}
            autoFocus={autoFocus && index === 0}
            aria-label={`Digit ${index + 1} of ${length}`}
            onFocus={() => setFocused(index)}
            onBlur={() => setFocused(null)}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className="absolute inset-x-0 top-0 h-[30px] w-full bg-transparent text-center text-[24px] font-medium text-ink outline-none"
          />
          <span
            className={`absolute inset-x-0 top-[46px] ${
              focused === index ? "h-[2px] bg-brand" : "h-px bg-muted"
            }`}
          />
        </div>
      ))}
    </div>
  );
}
