"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { ResendTimer } from "@/components/alpha/ResendTimer";
import { OtpInput } from "@/components/ui/OtpInput";
import { PhoneField } from "@/components/ui/PhoneField";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

const OTP_LENGTH = 4;

/**
 * Alpha's verification screen. It differs from the investor OTP artboard in two
 * ways: a resend countdown sits between the code and the resend line, and the
 * "Verify Number" variant collects the phone number on the same screen instead
 * of on the one before it.
 */
export function AlphaOtpBody({
  heading,
  subheading,
  withPhone = false,
  backHref,
  nextHref,
}: {
  heading: string;
  subheading: string;
  withPhone?: boolean;
  backHref: string;
  nextHref: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <AppShell>
      <AppBar backHref={backHref} />

      <div className="flex flex-1 flex-col px-5">
        <h1 className="mt-[50px] text-center text-[20px] font-semibold capitalize text-ink">
          {heading}
        </h1>
        <p className="mt-[14px] text-center text-[18px] text-muted">{subheading}</p>

        {withPhone && (
          <PhoneField className="mt-[50px]" value={phone} onValueChange={setPhone} />
        )}

        <OtpInput
          length={OTP_LENGTH}
          onChange={setCode}
          autoFocus={!withPhone}
          className={withPhone ? "mt-[62px]" : "mt-[66px]"}
        />

        <ResendTimer className="mt-[29px]" />

        <p className="mt-[30px] text-center text-[16px] font-medium text-muted">
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
