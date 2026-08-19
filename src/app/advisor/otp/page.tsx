"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { OtpScreenBody } from "@/components/screens/OtpScreenBody";
import { formatPhone } from "@/domain/phone";
import { verifyOtp } from "@/server/actions/auth";

function AdvisorOtp() {
  const params = useSearchParams();
  const phone = params.get("phone") ?? "";
  const hint = params.get("hint");

  return (
    <OtpScreenBody
      backHref="/"
      nextHref="/advisor/complete-profile"
      subheading={phone ? `We sent a code to ${formatPhone(phone)}` : "We sent you a code"}
      hint={hint}
      onVerify={async (code) => {
        if (!phone) return { error: "Start again from the beginning — we lost your number." };
        const result = await verifyOtp(phone, code, "ADVISOR");
        // The destination comes from the account's actual state, so a returning
        // verified advisor lands on their status rather than back at step one.
        return result.ok ? { redirectTo: result.data.next } : { error: result.error };
      }}
    />
  );
}

export default function AdvisorOtpPage() {
  // useSearchParams needs a Suspense boundary to keep the route's static shell.
  return (
    <Suspense>
      <AdvisorOtp />
    </Suspense>
  );
}
