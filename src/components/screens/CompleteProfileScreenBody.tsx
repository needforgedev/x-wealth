"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TextField } from "@/components/ui/TextField";

/**
 * Complete Profile is drawn the same on both the Investor and Advisor pages —
 * an investor continues to the onboarding questions, an advisor to KYC.
 */
export function CompleteProfileScreenBody({
  backHref,
  nextHref,
}: {
  backHref: string;
  nextHref: string;
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(true);

  return (
    <AppShell>
      <AppBar backHref={backHref} />

      <div className="flex flex-1 flex-col px-5">
        <h1 className="mt-[50px] text-center text-[20px] font-semibold capitalize text-ink">
          Complete Profile
        </h1>
        <p className="mt-[6px] text-center text-[18px] text-muted">Enter your details</p>

        <div className="mt-6 flex flex-col items-center">
          <Avatar initials="YB" />
          <button type="button" className="mt-[37px] flex items-center gap-[9px]">
            <Image
              src="/assets/icon-add-photo.svg"
              alt=""
              width={16}
              height={16}
              unoptimized
              className="size-[15.75px]"
            />
            <span className="text-[12px] font-semibold uppercase text-muted">
              Choose picture
            </span>
          </button>
        </div>

        <div className="mt-[50px] grid grid-cols-2 gap-x-[9px] gap-y-[19px]">
          <TextField label="First name" autoComplete="given-name" placeholder="Yash" />
          <TextField label="Last name" autoComplete="family-name" placeholder="Bhardwaj" />
          <TextField
            containerClassName="col-span-2"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <TextField label="DOB" trailing="chevron" readOnly placeholder="19-08-1998" />
          <TextField label="Gender" trailing="chevron" readOnly placeholder="Male" />
        </div>

        <Checkbox className="mt-[28px]" checked={agreed} onCheckedChange={setAgreed}>
          By using the App, you agree to our{" "}
          <span className="font-medium underline">Terms &amp; Conditions</span>
        </Checkbox>

        <PrimaryButton
          className="mt-auto mb-[calc(29px+env(safe-area-inset-bottom))]"
          onClick={() => router.push(nextHref)}
        >
          Continue
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
