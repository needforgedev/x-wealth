"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { OtpScreenBody } from "@/components/screens/OtpScreenBody";
import { formatPhone } from "@/domain/phone";
import { verifyOtp } from "@/server/actions/auth";

function Otp() {
  const params = useSearchParams();
  const phone = params.get("phone") ?? "";
  const hint = params.get("hint");

  return (
    <OtpScreenBody
      backHref="/"
      nextHref="/complete-profile"
      subheading={phone ? `We sent a code to ${formatPhone(phone)}` : "We sent you a code"}
      hint={hint}
      onVerify={async (code) => {
        if (!phone) return { error: "Start again from the beginning — we lost your number." };
        const result = await verifyOtp(phone, code);
        // Destination comes from how far this account has already got, so a
        // returning user is not walked through onboarding again. There is no
        // role to pass: v2 has one persona (CLAUDE.md §6).
        return result.ok ? { redirectTo: result.data.next } : { error: result.error };
      }}
    />
  );
}

export default function OtpPage() {
  return (
    <Suspense>
      <Otp />
    </Suspense>
  );
}
