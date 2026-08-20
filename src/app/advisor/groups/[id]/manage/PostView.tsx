"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LIMITS, MARKET_STANCES, type MarketStance } from "@/domain/signal";
import { postMarketView } from "@/server/actions/signal";

const input =
  "h-[44px] w-full rounded-[4px] border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand";

const STANCE_LABELS: Record<MarketStance, string> = {
  BULLISH: "Bullish",
  BEARISH: "Bearish",
  NEUTRAL: "Neutral",
};

/**
 * The market-view composer — the small thing to say that is not a call.
 *
 * The character counter is not decoration. The cap is what keeps this from
 * being a chat box, and it is enforced by a CHECK constraint as well as here;
 * showing the remaining count makes the boundary visible rather than a
 * surprise at submit.
 */
export function PostView({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stance, setStance] = useState<MarketStance>("BULLISH");
  const [symbol, setSymbol] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[44px] w-full rounded-[4px] border border-line text-[14px] font-semibold text-ink"
      >
        Post a view
      </button>
    );
  }

  async function submit() {
    setPending(true);
    setError(null);
    const result = await postMarketView({ groupId, stance, symbol, note });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSymbol("");
    setNote("");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-[8px] border border-line p-4">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-ink">Market view</p>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-muted">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
            Stance
          </span>
          <select
            value={stance}
            onChange={(e) => setStance(e.target.value as MarketStance)}
            className={`${input} mt-[6px]`}
          >
            {MARKET_STANCES.map((s) => (
              <option key={s} value={s}>
                {STANCE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
            Instrument
          </span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="NSE:NIFTY — or leave blank"
            className={`${input} mt-[6px]`}
          />
        </label>
      </div>

      <label className="block">
        <span className="flex items-baseline justify-between">
          <span className="text-[12px] font-medium uppercase tracking-wide text-muted">Note</span>
          <span className="text-[12px] text-muted">
            {LIMITS.note.max - note.length} left
          </span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={LIMITS.note.max}
          placeholder="Optional context."
          className="mt-[6px] w-full rounded-[4px] border border-line bg-surface p-3 text-[15px] text-ink outline-none focus:border-brand"
        />
      </label>

      {error && (
        <p role="alert" className="text-[14px] text-danger-ink">
          {error}
        </p>
      )}

      <p className="text-[12px] text-muted">
        A view is a direction, not an instruction — no entry, no stop. Like a call, it cannot be
        edited or deleted once posted.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="h-[44px] w-full rounded-[4px] bg-brand text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Posting…" : "Post view"}
      </button>
    </div>
  );
}
