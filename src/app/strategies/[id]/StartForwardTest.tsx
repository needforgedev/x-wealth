"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DEFAULT_PLANNED_SESSIONS, SESSION_WINDOW } from "@/domain/forward-test";
import { startForwardTest } from "@/server/actions/forward-test";

/**
 * Declare a hypothesis and open a forward window — `plan.md` W6-01, W6-10.
 *
 * The screen is arranged around the fact that pressing the button is
 * irreversible. Everything typed here freezes the moment the row goes RUNNING,
 * which happens in the same transaction that creates it — there is deliberately
 * no draft state to come back to and tune, because a draft that can be edited
 * while watching the market is exactly what the freeze exists to prevent
 * (`x-wealth-product.md` §5.2).
 *
 * So the consequences are stated before the fields, not in a toast afterwards,
 * and the button says what it does rather than "Save".
 */
export function StartForwardTest({
  versionId,
  versionNo,
}: {
  versionId: string;
  versionNo: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [hypothesis, setHypothesis] = useState("");
  const [sessions, setSessions] = useState(String(DEFAULT_PLANNED_SESSIONS));
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[40px] w-full rounded-[4px] border border-brand px-4 text-[14px] font-semibold text-brand"
      >
        Start a forward test on v{versionNo}
      </button>
    );
  }

  const parsed = Number(sessions);
  const sessionsValid =
    Number.isInteger(parsed) && parsed >= SESSION_WINDOW.min && parsed <= SESSION_WINDOW.max;
  const hypothesisValid = hypothesis.trim().length >= 30;

  return (
    <div className="rounded-[8px] border border-brand p-4">
      <h3 className="text-[15px] font-semibold text-ink">Forward test of v{versionNo}</h3>
      <p className="mt-2 text-[13px] text-muted">
        The rules, the capital, the cost model, the window and the sentence below all freeze the
        moment this starts, and the database refuses to change them afterwards. Revising anything
        means abandoning this test and starting another — and the abandoned one stays on your public
        record. The window opens on the next session, never today, so no part of it is already
        known.
      </p>

      <label htmlFor="ft-hypothesis" className="mt-4 block text-[13px] font-medium text-ink">
        What do you expect to happen, and roughly when?
      </label>
      <p id="ft-hypothesis-help" className="mt-1 text-[12px] text-muted">
        This is the sentence you will be judged against months from now, and it is recorded before
        any result exists. &ldquo;It will go up&rdquo; is not something anyone can be wrong about in
        an interesting way.
      </p>
      <textarea
        id="ft-hypothesis"
        value={hypothesis}
        onChange={(event) => setHypothesis(event.target.value)}
        rows={4}
        aria-describedby="ft-hypothesis-help"
        className="mt-2 w-full rounded-[4px] border border-field-line p-3 text-[14px] text-ink"
        placeholder="I expect this to take four to six trades over the window, most of them small losses, with the return coming from one or two trends held to the exit rule rather than from the hit rate."
      />
      <p className="mt-1 text-[12px] text-muted">
        {hypothesis.trim().length}/30 characters minimum
      </p>

      <label htmlFor="ft-sessions" className="mt-4 block text-[13px] font-medium text-ink">
        Window length, in trading sessions
      </label>
      <p id="ft-sessions-help" className="mt-1 text-[12px] text-muted">
        Between {SESSION_WINDOW.min} and {SESSION_WINDOW.max}. Chosen now, for this hypothesis, and
        fixed — a window that can be extended once the number looks better is not a test. Roughly{" "}
        {Number.isFinite(parsed) ? Math.round(parsed / 21) : 3} calendar{" "}
        {Math.round(parsed / 21) === 1 ? "month" : "months"}.
      </p>
      <input
        id="ft-sessions"
        type="number"
        inputMode="numeric"
        min={SESSION_WINDOW.min}
        max={SESSION_WINDOW.max}
        value={sessions}
        onChange={(event) => setSessions(event.target.value)}
        aria-describedby="ft-sessions-help"
        className="mt-2 h-[40px] w-[120px] rounded-[4px] border border-field-line px-3 text-[14px] tabular-nums text-ink"
      />

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending || !hypothesisValid || !sessionsValid}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await startForwardTest({
                strategyVersionId: versionId,
                hypothesis,
                plannedSessions: parsed,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.push(`/forward-tests/${result.data.forwardTestId}`);
            })
          }
          className="h-[40px] flex-1 rounded-[4px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Locking parameters…" : "Lock parameters and open the window"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="h-[40px] rounded-[4px] border border-line px-4 text-[14px] font-semibold text-ink"
        >
          Cancel
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
