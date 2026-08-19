import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { GATE_MESSAGES, registrationGate } from "@/domain/registration-gate";
import { currentIdentity } from "@/server/identity";
import { SignOutButton } from "./SignOutButton";

export const dynamic = "force-dynamic";

/**
 * Where an advisor lands after submitting, and the honest answer to "can I do
 * anything yet?".
 *
 * The state shown here is the registration gate itself, not a copy of it —
 * same function every protected action calls, so this page cannot drift out of
 * step with what the server will actually allow.
 */
export default async function AdvisorStatusPage() {
  const identity = await currentIdentity();
  if (!identity) redirect("/");
  if (!identity.advisor) redirect("/");

  const advisor = identity.advisor;
  const gate = registrationGate(advisor);

  const tone = gate.allowed
    ? { label: "Verified", className: "bg-up/[0.14] text-up" }
    : advisor.verificationStatus === "PENDING"
      ? { label: "Under review", className: "bg-brand/[0.12] text-brand" }
      : advisor.verificationStatus === "REJECTED"
        ? { label: "Rejected", className: "bg-danger/[0.12] text-danger-ink" }
        : { label: "Incomplete", className: "bg-surface-alt text-muted" };

  return (
    <AppShell>
      <AppBar showBack={false} />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[40px] text-center text-[20px] font-semibold text-ink">
          Registration status
        </h1>

        <div className="mt-6 rounded-[8px] border border-line p-5">
          <span
            className={`inline-flex h-[24px] items-center rounded-[3px] px-[10px] text-[11px] font-semibold uppercase ${tone.className}`}
          >
            {tone.label}
          </span>

          <p className="mt-3 text-[15px] text-ink">
            {gate.allowed
              ? "Your registration is verified. Publishing, groups and signals are unlocked."
              : GATE_MESSAGES[gate.reason]}
          </p>

          {advisor.rejectionReason && (
            <p className="mt-2 text-[14px] text-muted">Reason: {advisor.rejectionReason}</p>
          )}

          <dl className="mt-5 flex flex-col gap-2 text-[14px]">
            <Row label="Name" value={advisor.contactName} />
            <Row label="Firm" value={advisor.firmName} />
            <Row label="SEBI registration" value={advisor.sebiRegistrationNo} />
            <Row label="RAASB enlistment" value={advisor.raasbEnlistmentNo} />
            <Row
              label="Registration valid until"
              value={
                advisor.registrationValidUntil
                  ? advisor.registrationValidUntil.toISOString().slice(0, 10)
                  : null
              }
            />
          </dl>
        </div>

        {(advisor.verificationStatus === "UNSUBMITTED" ||
          advisor.verificationStatus === "REJECTED") && (
          <Link
            href="/advisor/kyc"
            className="mt-5 flex h-[53px] items-center justify-center rounded-[4px] bg-brand text-[16px] font-semibold text-white"
          >
            {advisor.verificationStatus === "REJECTED" ? "Correct and resubmit" : "Complete KYC"}
          </Link>
        )}

        {advisor.verificationStatus === "PENDING" && (
          <p className="mt-5 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
            Review is manual and deliberate — at low volume it is the right call, and it teaches us
            the edge cases before we try to encode them. To approve it yourself while testing, open{" "}
            <Link href="/ops" className="font-semibold text-brand">
              /ops
            </Link>{" "}
            as a platform admin.
          </p>
        )}

        {gate.allowed && (
          <>
            <Link
              href="/advisor/home"
              className="mt-5 flex h-[53px] items-center justify-center rounded-[4px] bg-brand text-[16px] font-semibold text-white"
            >
              Go to your strategies
            </Link>
            <p className="mt-4 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
              Authoring is live. Backtesting and the fixed forward-test window come next (W5, W6)
              — both need a market data source, which is still an open legal question.
            </p>
          </>
        )}

        <div className="mt-auto pt-8">
          <SignOutButton />
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-divider-soft pb-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{value ?? "—"}</dd>
    </div>
  );
}
