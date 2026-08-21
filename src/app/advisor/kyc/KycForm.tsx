"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { StepCheck } from "@/components/ui/StepCheck";
import { TextField } from "@/components/ui/TextField";
import { UploadField } from "@/components/ui/UploadField";
import { submitKyc } from "@/server/actions/advisor";

/**
 * Regulatory details. Submitting moves the record to PENDING — it cannot
 * verify itself. Only platform ops can do that (`/ops`), which is the
 * registration gate in `x-wealth-product.md` §5.4.
 *
 * The artboard is 1031px tall, so it scrolls rather than pinning the CTA.
 */
export function KycForm() {
  const router = useRouter();
  const [sebi, setSebi] = useState("");
  const [raasb, setRaasb] = useState("");
  const [firm, setFirm] = useState("");
  const [mca, setMca] = useState("");
  const [validUntil, setValidUntil] = useState("");
  // Lazily, once: reading the clock during render is impure and re-renders
  // would make the floor drift under the picker.
  const [earliestValidUntil] = useState(() =>
    new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  );
  const [attached, setAttached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setError(null);
    setPending(true);
    const result = await submitKyc({
      sebiRegistrationNo: sebi,
      raasbEnlistmentNo: raasb,
      firmName: firm,
      mcaNo: mca,
      registrationValidUntil: validUntil,
      documentType: "SEBI_REGISTRATION_CERTIFICATE",
      documentAttached: attached,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/advisor/status");
  };

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
            label="Registration Number"
            placeholder="INH000012345"
            value={sebi}
            onChange={(e) => setSebi(e.target.value)}
          />
          <TextField
            label="RAASB Enlistment Number"
            placeholder="RAASB/2026/00881"
            value={raasb}
            onChange={(e) => setRaasb(e.target.value)}
          />
          <TextField
            label="Firm Name"
            placeholder="Bansal Research"
            value={firm}
            onChange={(e) => setFirm(e.target.value)}
          />
          <TextField
            label="MCA Number"
            placeholder="Optional"
            value={mca}
            onChange={(e) => setMca(e.target.value)}
          />
          <TextField
            label="Registration valid until"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            min={earliestValidUntil}
          />

          <UploadField
            label="Registration certificate"
            action={attached ? "Attached" : "Choose document"}
            selected={attached}
            onClick={() => setAttached((v) => !v)}
          />
          <p className="-mt-[8px] text-[12px] text-muted">
            Attaching is simulated for now — real uploads go to a private bucket with signed-URL
            access and an audit entry per read (W1-19).
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-center text-[14px] text-danger-ink">
            {error}
          </p>
        )}

        <PrimaryButton className="mt-[37px]" disabled={pending} onClick={submit}>
          {pending ? "Submitting…" : "Submit for verification"}
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
