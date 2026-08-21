"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { runBacktestForVersion } from "@/server/actions/backtest";

/**
 * Run a backtest of one version.
 *
 * Every press appends a run. There is no "re-run" that replaces the previous
 * result and no way to discard one — `backtest_runs` is append-only, and an
 * advisor who dislikes a number gets another row, not a rewrite
 * (`x-wealth-product.md` §5.1).
 */
export function RunBacktest({ versionId, runCount }: { versionId: string; runCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await runBacktestForVersion({ strategyVersionId: versionId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/advisor/backtests/${result.data.runId}`);
          })
        }
        className="h-[40px] w-full rounded-[4px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Running…" : runCount === 0 ? "Backtest this version" : "Run again"}
      </button>

      {runCount > 0 && (
        <p className="mt-2 text-[12px] text-muted">
          {runCount} {runCount === 1 ? "run" : "runs"} recorded. Running again appends another —
          nothing is replaced.
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
