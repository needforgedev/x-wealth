"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { runPostMortem } from "@/server/actions/post-mortem";

/**
 * Write the post-mortem for a completed window. `plan.md` W7-13.
 *
 * A deliberate step, like attacking a backtest (`W18-12`), and for a cousin of
 * the same reason: the first valid post-mortem under the current prompt is the
 * one every later press returns, so this button cannot be leaned on until the
 * narrative reads kinder. What it explains is fixed; so is the explanation.
 */
export function RunPostMortem({ forwardTestId }: { forwardTestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notLive, setNotLive] = useState(false);

  if (notLive) {
    return (
      <p className="mt-3 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
        No model is configured, so nothing was generated. The request was still logged — set{" "}
        <code>OPENROUTER_API_KEY</code> and press again for the real thing.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-[6px] border border-line p-4">
      <h3 className="text-[14px] font-semibold text-ink">This window has no post-mortem yet</h3>
      <p className="mt-1 text-[13px] text-muted">
        The record is complete: the hypothesis you declared before the window opened, the rules
        that were frozen, and every session since. The post-mortem reads that record and explains
        what happened against what you expected — it describes, it never grades, and what you do
        with it stays your decision.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await runPostMortem({ forwardTestId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            if (!result.data.live) {
              setNotLive(true);
              return;
            }
            router.refresh();
          })
        }
        className="mt-4 h-[40px] w-full rounded-[4px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Reading the record…" : "Write the post-mortem"}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
