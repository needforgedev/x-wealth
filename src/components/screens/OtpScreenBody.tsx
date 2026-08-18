"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { OtpInput } from "@/components/ui/OtpInput";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

const OTP_LENGTH = 4;

/**
 * The OTP artboard is drawn identically on the Investor and Advisor pages, so
 * both flows render this and only differ in where Verify lands.
 */
export function OtpScreenBody({
  backHref,
  nextHref,
}: {
  backHref: string;
  nextHref: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <AppShell>
      <AppBar backHref={backHref} />

      <div className="flex flex-1 flex-col px-5">
        <h1 className="mt-[50px] text-center text-[20px] font-semibold capitalize text-ink">
          Enter OTP
        </h1>
        <p className="mt-[14px] text-center text-[18px] text-muted">We sent you a code</p>

        <OtpInput length={OTP_LENGTH} onChange={setCode} className="mt-[66px]" />

        <p className="mt-[42px] text-center text-[16px] font-medium text-muted">
          Didn&rsquo;t receive the code?{" "}
          <button type="button" className="font-semibold text-ink">
            Resend
          </button>
        </p>

        <PrimaryButton
          className="mt-auto mb-[calc(29px+env(safe-area-inset-bottom))]"
          onClick={() => {
            if (code.length === OTP_LENGTH) router.push(nextHref);
          }}
        >
          Verify OTP
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
