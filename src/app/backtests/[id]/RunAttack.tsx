"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { attackBacktestRun } from "@/server/actions/adversarial";

/**
 * Attack this run.
 *
 * The button says what it does. Not "Analyse", not "Validate", not "Check" —
 * `CLAUDE.md` §7.7 is that the suite's job is to break the strategy, and a
 * neutral verb would set up the expectation of a verdict that the report
 * deliberately never gives.
 *
 * There is no "run again". The report is unique per run, suite version and
 * seed, and the suite is deterministic, so a second press returns the report
 * that already exists. A user who could re-attack until the findings read
 * better would have the retry loop this product is built to remove.
 */
export function RunAttack({ runId, tradeCount }: { runId: string; tradeCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-4 rounded-[6px] border border-line p-4">
      <h3 className="text-[14px] font-semibold text-ink">This result has not been attacked</h3>
      <p className="mt-1 text-[13px] text-muted">
        A backtest is the most flattering account of a strategy that exists — it is the one run
        where the rules already knew what the market did. The suite looks for the reasons these
        numbers should not be believed: whether the edge survives being split across time, whether
        it survives a small change to any parameter, whether it depended on one kind of market, how
        much of the drawdown was luck, and how little slippage it takes to erase.
      </p>
      <p className="mt-2 text-[13px] text-muted">
        It re-runs the engine around thirty times, so it is a deliberate step rather than something
        that happens automatically. It is written to your record once and cannot be re-rolled for a
        friendlier answer.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await attackBacktestRun({ runId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/backtests/${runId}/attack`);
          })
        }
        className="mt-4 h-[40px] w-full rounded-[4px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Attacking…" : "Attack this backtest"}
      </button>

      {tradeCount === 0 && (
        <p className="mt-2 text-[12px] text-muted">
          These rules produced no trades, so most of the suite will have nothing to work with. The
          report will say which attacks could not run, and why.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
