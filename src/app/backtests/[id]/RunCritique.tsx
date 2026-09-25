"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { runCritique } from "@/server/actions/critique";

/**
 * Ask what limits this backtest. `plan.md` W7-03…07.
 *
 * A deliberate step with the attack report's retry posture (W18-12): the
 * first valid answer under the current prompt version is the one every later
 * press returns, so this cannot be leaned on until the account reads kinder.
 */
export function RunCritique({ backtestRunId }: { backtestRunId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notLive, setNotLive] = useState(false);

  if (notLive) {
    return (
      <p className="mt-4 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
        No model is configured, so nothing was generated. The request was still logged — set{" "}
        <code>OPENROUTER_API_KEY</code> and press again for the real thing.
      </p>
    );
  }

  return (
    <div className="mt-8 rounded-[6px] border border-line p-4">
      <h3 className="text-[14px] font-semibold text-ink">
        What limits these numbers has not been written up
      </h3>
      <p className="mt-1 text-[13px] text-muted">
        The critique reads this run&rsquo;s record — the figures above, the parameters these rules
        expose, and the attack report if one exists — and states what bounds how far the result
        can be believed: how many trades stand behind it, how many numbers could have been chosen
        differently, and what the drawdown path looked like. It describes; it never grades and it
        never suggests changes.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await runCritique({ backtestRunId });
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
        {pending ? "Reading the record…" : "Write the critique"}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
