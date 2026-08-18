"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { CarouselDots } from "@/components/ui/CarouselDots";
import { PhoneField } from "@/components/ui/PhoneField";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { RoleTabs, type Role } from "@/components/ui/RoleTabs";

const COPY: Record<Role, { heading: string; subheading: string }> = {
  investor: {
    heading: "Get started as an investor",
    subheading: "Get quality trading signals by certified experts and professionals",
  },
  advisor: {
    heading: "Earn money for your signals",
    subheading: "Get quality trading signals by certified experts and professionals",
  },
};

const FEATURES = ["Verified Experts", "Quality Signals"] as const;

export default function GetStartedPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("investor");
  const [phone, setPhone] = useState("");
  const { heading, subheading } = COPY[role];

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
        <RoleTabs value={role} onChange={setRole} />

        <div
          id={`panel-${role}`}
          role="tabpanel"
          aria-labelledby={`tab-${role}`}
          className="px-5 pt-10 pb-[calc(28px+env(safe-area-inset-bottom))]"
        >
          <h1 className="text-[18px] font-semibold capitalize text-ink">{heading}</h1>
          <p className="mt-2 max-w-[305px] text-[16px] text-muted">{subheading}</p>

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

          <PrimaryButton
            className="mt-3"
            onClick={() => router.push(role === "advisor" ? "/advisor/otp" : "/otp")}
          >
            Get Started
          </PrimaryButton>

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
