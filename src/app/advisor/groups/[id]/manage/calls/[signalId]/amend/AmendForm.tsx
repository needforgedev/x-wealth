"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { RISK_PROFILES, type RiskProfile } from "@/domain/signal";
import { amendTradeCall, type AmendableCall } from "@/server/actions/signal";

const input =
  "h-[44px] w-full rounded-[4px] border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="mt-[6px]">{children}</div>
    </label>
  );
}

const RISK_LABELS: Record<RiskProfile, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

/** A `Date` as `datetime-local` wants it: `YYYY-MM-DDTHH:mm`, local time. */
function localValue(when: Date | null): string {
  if (!when) return "";
  const offset = when.getTimezoneOffset() * 60_000;
  return new Date(when.getTime() - offset).toISOString().slice(0, 16);
}

/** Trailing zeros off a stored `numeric(18,4)`, for an editable field. */
function editablePrice(value: string | null): string {
  if (!value) return "";
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

/**
 * Pre-filled with the original so the advisor corrects one number rather than
 * retyping the call — retyping is itself a chance to introduce a second error.
 *
 * The instrument, side and strategy are shown but not editable: an amendment
 * keeps them by definition, and both the action and a database trigger refuse
 * anything else.
 */
export function AmendForm({ call }: { call: AmendableCall }) {
  const router = useRouter();
  const [entryPrice, setEntryPrice] = useState(editablePrice(call.entryPrice));
  const [stopLoss, setStopLoss] = useState(editablePrice(call.stopLoss));
  const [exitPrice, setExitPrice] = useState(editablePrice(call.exitPrice));
  const [targets, setTargets] = useState<string[]>(() => {
    const existing = call.targets.map((t) => editablePrice(t.price));
    return [...existing, "", "", ""].slice(0, Math.max(3, existing.length));
  });
  const [validFrom, setValidFrom] = useState(localValue(call.validFrom));
  const [validUntil, setValidUntil] = useState(localValue(call.validUntil));
  const [rationale, setRationale] = useState(call.rationale ?? "");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>(call.riskProfile);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await amendTradeCall({
      amendsSignalId: call.id,
      entryPrice,
      stopLoss,
      exitPrice,
      targets,
      validFrom,
      validUntil,
      rationale,
      riskProfile,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/advisor/groups/${result.data.groupId}/manage`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[6px] bg-surface-alt p-3">
        <p className="text-[13px] text-ink">
          {call.side} {call.symbol} · {call.strategyName}
        </p>
        <p className="mt-[2px] text-[12px] text-muted">
          Fixed by the call being amended. The original stays published.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Entry ₹">
          <input
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            inputMode="decimal"
            className={input}
          />
        </Field>
        <Field label="Stop-loss ₹">
          <input
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            inputMode="decimal"
            className={input}
          />
        </Field>
        <Field label="Exit ₹">
          <input
            value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)}
            inputMode="decimal"
            placeholder="optional"
            className={input}
          />
        </Field>
      </div>

      <div>
        <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
          Targets ₹
        </span>
        <div className="mt-[6px] grid grid-cols-3 gap-3">
          {targets.map((target, index) => (
            <input
              key={index}
              aria-label={`Target ${index + 1}`}
              value={target}
              onChange={(e) =>
                setTargets((current) =>
                  current.map((value, i) => (i === index ? e.target.value : value)),
                )
              }
              inputMode="decimal"
              placeholder={`T${index + 1}`}
              className={input}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valid from">
          <input
            type="datetime-local"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className={input}
          />
        </Field>
        <Field label="Valid until">
          <input
            type="datetime-local"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={input}
          />
        </Field>
      </div>

      <Field label="Risk">
        <select
          value={riskProfile}
          onChange={(e) => setRiskProfile(e.target.value as RiskProfile)}
          className={input}
        >
          {RISK_PROFILES.map((r) => (
            <option key={r} value={r}>
              {RISK_LABELS[r]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Rationale">
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="What changed, and why."
          className="w-full rounded-[4px] border border-line bg-surface p-3 text-[15px] text-ink outline-none focus:border-brand"
        />
      </Field>

      {error && (
        <p role="alert" className="text-[14px] text-danger-ink">
          {error}
        </p>
      )}

      <p className="text-[12px] text-muted">
        This publishes a new call pointing at the original. The original is not edited and not
        removed — it stays in the feed, marked as superseded. A call can be amended once; correcting
        an amendment means amending that.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="h-[44px] w-full rounded-[4px] bg-brand text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Publishing…" : "Publish amendment"}
      </button>
    </div>
  );
}
