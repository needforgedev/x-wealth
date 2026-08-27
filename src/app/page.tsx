"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AppShell } from "@/components/AppShell";
import { CarouselDots } from "@/components/ui/CarouselDots";
import { PhoneField } from "@/components/ui/PhoneField";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { normalisePhone } from "@/domain/phone";
import { sendOtp } from "@/server/actions/auth";

/**
 * One persona, one panel.
 *
 * This screen used to offer Investor and Advisor tabs, pitch "quality trading
 * signals by certified experts", and tick "Verified Experts" / "Quality
 * Signals". Every part of that is prohibited now: `CLAUDE.md` §2 abandons the
 * advisor direction, §8.5 keeps a user's strategies private to them, and §8.7
 * forbids the platform characterising anyone's performance — "verified" and
 * "quality" are exactly the words it names.
 *
 * The features below describe what the tool does mechanically. They make no
 * claim about outcomes, because we do not have one to make.
 */
const HEADING = "Test your trading idea before it costs you";
const SUBHEADING =
  "Describe a rule in plain English, run it against five years of history net of Indian costs, then forward-test it on paper before it sees real money.";

const FEATURES = ["Net of every cost", "Locked forward tests"] as const;

export default function GetStartedPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () => {
    setError(null);

    const e164 = normalisePhone(phone);
    if (!e164) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }

    startTransition(async () => {
      const result = await sendOtp(e164);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const hint = result.data.hint ? `&hint=${encodeURIComponent(result.data.hint)}` : "";
      router.push(`/otp?phone=${encodeURIComponent(e164)}${hint}`);
    });
  };

  return (
    <AppShell>
      <header className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 pt-[45px] pb-[31px] [@media(max-height:720px)]:pt-6 [@media(max-height:720px)]:pb-5">
        <Image
          src="/assets/logo-xwealth.svg"
          alt="X Wealth"
          width={141}
          height={42}
          priority
          unoptimized
          className="h-[42px] w-[141.217px] max-w-full"
        />

        <Image
          src="/assets/hero-investor.svg"
          alt=""
          width={213}
          height={190}
          priority
          unoptimized
          className="mt-[29px] h-auto w-[213px] max-w-full [@media(max-height:720px)]:w-[165px]"
        />

        <CarouselDots
          count={3}
          active={0}
          className="mt-[43px] [@media(max-height:720px)]:mt-6"
        />
      </header>

      <section className="bg-surface shadow-card">
        <div className="px-5 pt-10 pb-[calc(28px+env(safe-area-inset-bottom))]">
          <h1 className="text-[18px] font-semibold text-ink">{HEADING}</h1>
          <p className="mt-2 max-w-[305px] text-[16px] text-muted">{SUBHEADING}</p>

          <ul className="mt-6 grid grid-cols-2 gap-x-2 gap-y-3">
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

          <PhoneField
            className="mt-7"
            value={phone}
            onValueChange={setPhone}
          />

          <PrimaryButton className="mt-3" disabled={pending} onClick={start}>
            {pending ? "Sending code…" : "Get Started"}
          </PrimaryButton>

          {error && (
            <p role="alert" className="mt-2 text-center text-[14px] text-danger-ink">
              {error}
            </p>
          )}

          <p className="mt-7 text-center text-[16px] font-medium text-muted">
            Already have an account?{" "}
            <a href="#" className="font-semibold text-ink">
              Login
            </a>
          </p>
        </div>
      </section>
    </AppShell>
  );
}
