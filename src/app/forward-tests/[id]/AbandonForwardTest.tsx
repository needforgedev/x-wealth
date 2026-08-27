"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { abandonForwardTest } from "@/server/actions/forward-test";

/**
 * Abandon a running forward test — `plan.md` W6-08.
 *
 * Two deliberate frictions, both about the reason rather than the decision:
 *
 * The reason is typed before the button appears, because a confirm dialog with
 * an optional note produces empty reasons, and a reason nobody wrote is not a
 * reason. It is required by the action too — this is only the affordance.
 *
 * The advisor is told the reason gets published *before* they write it, not
 * after they submit. Someone who would phrase it differently knowing it is
 * public should find that out while they can still phrase it differently.
 *
 * There is no undo, and no code path to one. `forward_tests` only moves
 * forward, and the trigger refuses ABANDONED → anything.
 */
export function AbandonForwardTest({ forwardTestId }: { forwardTestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = reason.trim().length < 10;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="h-[40px] w-full rounded-[4px] border border-line px-4 text-[14px] font-semibold text-ink"
      >
        Abandon test
      </button>
    );
  }

  return (
    <div>
      <label htmlFor="abandon-reason" className="text-[13px] font-medium text-ink">
        Why are you stopping?
      </label>
      <p id="abandon-reason-help" className="mt-1 text-[12px] text-muted">
        Published with the test, permanently, on your public profile. Written now rather than
        reconstructed later.
      </p>
      <textarea
        id="abandon-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        aria-describedby="abandon-reason-help"
        className="mt-2 w-full rounded-[4px] border border-field-line p-3 text-[14px] text-ink"
        placeholder="The hypothesis was answered by session 18 — the entry rule fired twice in a flat market and both were stopped out."
      />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending || tooShort}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await abandonForwardTest({ forwardTestId, reason });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.refresh();
            })
          }
          className="h-[40px] flex-1 rounded-[4px] bg-danger-ink px-4 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Abandoning…" : "Abandon permanently"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          className="h-[40px] rounded-[4px] border border-line px-4 text-[14px] font-semibold text-ink"
        >
          Keep running
        </button>
      </div>

      {tooShort && reason.length > 0 && (
        <p className="mt-2 text-[12px] text-muted">A little more detail — at least ten characters.</p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
