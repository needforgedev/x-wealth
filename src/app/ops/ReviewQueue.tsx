"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveAdvisor, rejectAdvisor, type PendingAdvisor } from "@/server/actions/ops";

/**
 * Manual registration review.
 *
 * The expiry date is a required field, not a nicety: the registration gate
 * fails closed without one, so approving without a date would produce a
 * "verified" advisor who still cannot publish.
 */
export function ReviewQueue({
  pending,
  decided,
}: {
  pending: PendingAdvisor[];
  decided: PendingAdvisor[];
}) {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12">
      <h1 className="text-[22px] font-semibold text-ink">Verification queue</h1>
      <p className="mt-2 text-[15px] text-muted">
        Cross-check each registration number against the SEBI register and the BSE RAASB
        enlistment before approving. Every decision is written to the audit log.
      </p>

      <section className="mt-8">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
          Awaiting review ({pending.length})
        </h2>

        {pending.length === 0 ? (
          <p className="mt-3 text-[14px] text-muted">
            Nothing pending. Submit KYC as an advisor to put something here.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-4">
            {pending.map((advisor) => (
              <ReviewCard key={advisor.id} advisor={advisor} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Decided</h2>
        {decided.length === 0 ? (
          <p className="mt-3 text-[14px] text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col">
            {decided.map((advisor) => (
              <li
                key={advisor.id}
                className="flex flex-wrap items-baseline gap-x-3 border-b border-divider-soft py-3 text-[14px]"
              >
                <span className="font-medium text-ink">{advisor.contactName ?? "—"}</span>
                <span className="text-muted">{advisor.sebiRegistrationNo}</span>
                <span className="ml-auto text-[13px] text-muted">{advisor.firmName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const inputClass =
  "h-[38px] rounded-[4px] border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-brand";

function ReviewCard({ advisor }: { advisor: PendingAdvisor }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Failed.");
        return;
      }
      router.refresh();
    });

  return (
    <li className="rounded-[8px] border border-line p-5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-[16px] font-semibold text-ink">{advisor.contactName ?? "—"}</span>
        <span className="text-[14px] text-muted">{advisor.contactEmail}</span>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-2">
        <Row label="Firm" value={advisor.firmName} />
        <Row label="SEBI registration" value={advisor.sebiRegistrationNo} />
        <Row label="RAASB enlistment" value={advisor.raasbEnlistmentNo} />
        <Row label="MCA" value={advisor.mcaNo} />
      </dl>

      {rejecting ? (
        <div className="mt-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why is this being rejected? The advisor sees this."
            className="w-full rounded-[4px] border border-line px-3 py-2 text-[14px] text-ink outline-none focus:border-brand"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => rejectAdvisor({ advisorId: advisor.id, reason }))}
              className="h-[38px] rounded-[4px] bg-danger-ink px-4 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              Confirm rejection
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="h-[38px] rounded-[4px] border border-line px-4 text-[14px] font-semibold text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-[6px] text-[12px] font-medium uppercase tracking-wide text-muted">
            Registration valid until
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() =>
                approveAdvisor({ advisorId: advisor.id, registrationValidUntil: validUntil }),
              )
            }
            className="h-[38px] rounded-[4px] bg-brand px-5 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Working…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="h-[38px] rounded-[4px] border border-line px-4 text-[14px] font-semibold text-ink"
          >
            Reject
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[14px] text-danger-ink">
          {error}
        </p>
      )}
    </li>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{value ?? "—"}</dd>
    </div>
  );
}
