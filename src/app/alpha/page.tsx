"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { GoogleMark } from "@/components/alpha/GoogleMark";
import { PhoneField } from "@/components/ui/PhoneField";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

const FEATURES = ["Verified Experts", "Quality Signals"] as const;

/**
 * Alpha's entry screen. Where the Investor page opens on a role picker, Alpha
 * opens straight into an advisor login with a second, federated way in — the
 * artboard is labelled "ADVISOR LOGIN" and carries no investor tab.
 */
export default function AlphaLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");

  return (
    <AppShell className="bg-surface-alt">
      <header className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-5">
        <p className="absolute right-[33px] top-[27px] text-[13px] font-semibold uppercase text-brand">
          Advisor Login
        </p>

        <Image
          src="/assets/logo-xwealth.svg"
          alt="X Wealth"
          width={192}
          height={57}
          priority
          unoptimized
          className="h-[57px] w-[192px] max-w-full"
        />
      </header>

      <section className="rounded-t-[4px] bg-surface px-[19px] pt-[27px] pb-[calc(23px+env(safe-area-inset-bottom))] shadow-card">
        <h1 className="text-[18px] font-semibold text-ink">Earn money for your signals</h1>
        <p className="mt-[8px] text-[16px] text-muted">
          Get quality trading signals by certified experts and professionals
        </p>

        <ul className="mt-[16px] grid grid-cols-2 gap-x-2">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-[9px]">
              <Image
                src="/assets/icon-check.svg"
                alt=""
                width={14}
                height={11}
                unoptimized
                className="h-[10.62px] w-[13.93px] shrink-0"
              />
              <span className="text-[14px] text-muted">{feature}</span>
            </li>
          ))}
        </ul>

        <PhoneField className="mt-[28px]" value={phone} onValueChange={setPhone} />

        <PrimaryButton className="mt-[12px]" onClick={() => router.push("/alpha/verify-number")}>
          Continue with Phone
        </PrimaryButton>

        <button
          type="button"
          onClick={() => router.push("/alpha/google")}
          className="relative mt-[12px] flex h-[53px] w-full items-center justify-center rounded-[4px] border border-[#e9e9e9] bg-surface text-[16px] font-semibold text-[#434a5e]"
        >
          <span className="absolute left-[12px] flex size-[28px] items-center justify-center">
            <GoogleMark />
          </span>
          Continue with Google
        </button>
      </section>
    </AppShell>
  );
}
