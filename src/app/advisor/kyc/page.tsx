"use client";

import { useRouter } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { StepCheck } from "@/components/ui/StepCheck";
import { TextField } from "@/components/ui/TextField";
import { UploadField } from "@/components/ui/UploadField";
import { KYC_DRAFT } from "@/lib/advisor";

/**
 * Regulatory details an advisor supplies after Complete Profile. The artboard
 * is 1031px tall, so it scrolls rather than pinning the CTA to the bottom.
 */
export default function AdvisorKycPage() {
  const router = useRouter();

  return (
    <AppShell>
      <AppBar backHref="/advisor/complete-profile" />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <div className="mt-[50px] flex items-center justify-center gap-[11px]">
          <StepCheck label="Profile complete" />
          <h1 className="text-[20px] font-semibold capitalize text-ink">Complete KYC</h1>
        </div>
        <p className="mt-[6px] text-center text-[18px] text-muted">Enter your details</p>

        <div className="mt-[48px] flex flex-col gap-[16px]">
          <TextField
            label="SEBI Registered"
            trailing="chevron"
            readOnly
            defaultValue={KYC_DRAFT.sebiRegistered}
          />
          <TextField label="Registration Number" defaultValue={KYC_DRAFT.registrationNumber} />
          <TextField
            label="Document Type"
            trailing="chevron"
            readOnly
            defaultValue={KYC_DRAFT.documentType}
          />
          <TextField label="PAN Card" defaultValue={KYC_DRAFT.panCard} />
          <UploadField label="Upload Documents" action="Choose document" />
          <TextField label="Firm Name" defaultValue={KYC_DRAFT.firmName} />
          <TextField label="MCA Number" defaultValue={KYC_DRAFT.mcaNumber} />
        </div>

        <PrimaryButton
          className="mt-[37px]"
          onClick={() => router.push("/advisor/create-group")}
        >
          Continue
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
