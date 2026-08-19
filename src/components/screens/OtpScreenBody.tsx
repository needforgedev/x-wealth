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
  onVerify,
  subheading = "We sent you a code",
  hint,
}: {
  backHref: string;
  nextHref: string;
  /**
   * Live verification. Returns where to go next, because this screen is both
   * sign-up and sign-in and the destination depends on how far the account has
   * already got. When omitted the screen just navigates to `nextHref`, which is
   * how the investor and Alpha artboards still behave — they are not wired yet.
   */
  onVerify?: (code: string) => Promise<{ error: string } | { redirectTo: string }>;
  subheading?: string;
  /** Shown above the code field — e.g. that SMS is not configured yet. */
  hint?: string | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (code.length !== OTP_LENGTH) return;
    setError(null);

    if (!onVerify) {
      router.push(nextHref);
      return;
    }

    setPending(true);
    const result = await onVerify(code);
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push(result.redirectTo);
  };

  return (
    <AppShell>
      <AppBar backHref={backHref} />

      <div className="flex flex-1 flex-col px-5">
        <h1 className="mt-[50px] text-center text-[20px] font-semibold capitalize text-ink">
          Enter OTP
        </h1>
        <p className="mt-[14px] text-center text-[18px] text-muted">{subheading}</p>

        {hint && (
          <p className="mt-[18px] rounded-[4px] bg-surface-alt px-4 py-3 text-center text-[13px] text-muted">
            {hint}
          </p>
        )}

        <OtpInput length={OTP_LENGTH} onChange={setCode} className={hint ? "mt-[34px]" : "mt-[66px]"} />

        <p className="mt-[42px] text-center text-[16px] font-medium text-muted">
          Didn&rsquo;t receive the code?{" "}
          <button type="button" className="font-semibold text-ink">
            Resend
          </button>
        </p>

        {error && (
          <p role="alert" className="mt-4 text-center text-[14px] text-danger-ink">
            {error}
          </p>
        )}

        <PrimaryButton
          className="mt-auto mb-[calc(29px+env(safe-area-inset-bottom))]"
          disabled={pending || code.length !== OTP_LENGTH}
          onClick={submit}
        >
          {pending ? "Verifying…" : "Verify OTP"}
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
