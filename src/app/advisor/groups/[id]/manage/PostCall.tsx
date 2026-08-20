"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { NOT_FORWARD_TESTED_NOTICE, RISK_PROFILES, TRADE_SIDES } from "@/domain/signal";
import type { RiskProfile, TradeSide } from "@/domain/signal";
import { postTradeCall } from "@/server/actions/signal";

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

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time. */
function localNow(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

const RISK_LABELS: Record<RiskProfile, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

/**
 * The trade call composer.
 *
 * There is no timeframe field: a call inherits it from the strategy it comes
 * from, so it cannot claim to be a 1-day call off a strategy that does not run
 * daily. Everything else is checked in `src/domain/signal.ts` — in particular
 * that the stop-loss sits on the losing side of the entry and that targets run
 * away from it in order, both of which are valid rows and incoherent advice.
 */
export function PostCall({
  groupId,
  strategies,
}: {
  groupId: string;
  strategies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [strategyId, setStrategyId] = useState(strategies[0]?.id ?? "");
  const [side, setSide] = useState<TradeSide>("BUY");
  const [symbol, setSymbol] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [targets, setTargets] = useState<string[]>(["", "", ""]);
  const [validFrom, setValidFrom] = useState(localNow);
  const [validUntil, setValidUntil] = useState("");
  const [rationale, setRationale] = useState("");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (strategies.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        Publish a strategy to this group before posting a call. A call is an instance of a strategy
        firing, and investors have to be able to see the rules that produced it.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[44px] w-full rounded-[4px] border border-line text-[14px] font-semibold text-ink"
      >
        Post a trade call
      </button>
    );
  }

  async function submit() {
    setPending(true);
    setError(null);
    const result = await postTradeCall({
      groupId,
      strategyId,
      side,
      symbol,
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
    setSymbol("");
    setEntryPrice("");
    setStopLoss("");
    setExitPrice("");
    setTargets(["", "", ""]);
    setRationale("");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-[8px] border border-line p-4">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-ink">Trade call</p>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-muted">
          Cancel
        </button>
      </div>

      {/*
        Stated before the form, not after it. The advisor should know what the
        card will say about their call while they are writing it.
      */}
      <p className="rounded-[4px] bg-danger-ink/[0.06] px-3 py-2 text-[12px] text-danger-ink">
        {NOT_FORWARD_TESTED_NOTICE} Every call carries that notice until the forward-test engine
        exists.
      </p>

      <Field label="From strategy">
        <select
          value={strategyId}
          onChange={(e) => setStrategyId(e.target.value)}
          className={input}
        >
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Side">
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as TradeSide)}
            className={input}
          >
            {TRADE_SIDES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Instrument">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="NSE:TATASTEEL"
            className={input}
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Entry ₹">
          <input
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            inputMode="decimal"
            placeholder="345"
            className={input}
          />
        </Field>
        <Field label="Stop-loss ₹">
          <input
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            inputMode="decimal"
            placeholder="330"
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
        <span className="mt-[5px] block text-[12px] text-muted">
          In order, away from the entry. Leave any blank.
        </span>
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
          placeholder="Why this, now."
          className="w-full rounded-[4px] border border-line bg-surface p-3 text-[15px] text-ink outline-none focus:border-brand"
        />
      </Field>

      {error && (
        <p role="alert" className="text-[14px] text-danger-ink">
          {error}
        </p>
      )}

      {/*
        A published call cannot be edited or deleted — `signals` is append-only
        and a trigger enforces it. Saying so here is fairer than finding out.
      */}
      <p className="text-[12px] text-muted">
        Once posted, a call cannot be edited or deleted. Correcting one means posting an amendment.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="h-[44px] w-full rounded-[4px] bg-brand text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Posting…" : "Post call"}
      </button>
    </div>
  );
}
