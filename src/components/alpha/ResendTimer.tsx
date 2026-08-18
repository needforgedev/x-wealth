"use client";

import { useEffect, useState } from "react";

/**
 * Countdown above the resend line. The Alpha OTP artboards draw it as "- 0:29",
 * so it renders in that shape and stops at zero, at which point resending
 * becomes the live affordance.
 */
export function ResendTimer({
  seconds = 29,
  className = "",
}: {
  seconds?: number;
  className?: string;
}) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  const label = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <p className={`text-center text-[16px] font-medium text-muted ${className}`}>
      {left > 0 ? `- ${label}` : "- 0:00"}
    </p>
  );
}
