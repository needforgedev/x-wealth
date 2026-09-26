"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  ANNOTATION_REASONS,
  REASON_LABELS,
  REASONS_REQUIRING_TEXT,
  type AnnotationReason,
  type AnnotationTarget,
} from "@/domain/annotation";
import { addAnnotation } from "@/server/actions/annotation";

/**
 * Notes on the record. `plan.md` W17, `CLAUDE.md` §7.5 and §8.8.
 *
 * ## Superseded notes stay on screen
 *
 * Muted, labelled, above their replacement — never removed. A note records
 * what its author believed at the time, and the revision records that the
 * belief changed; showing only the final version would make every note look
 * like it was always right, which is the exact comfort this product refuses
 * everywhere else.
 *
 * ## Why the form is this plain
 *
 * W17-06: a reason is only worth aggregating if it was recorded when it was
 * true. Every field added here is a reason to put off writing it down, and a
 * note deferred to the weekend is a reconstruction wearing a timestamp.
 */

export type AnnotationTargetOption = {
  readonly label: string;
  readonly targetType: AnnotationTarget;
  readonly targetId: string;
};

/** A row, serialised for the client. Dates cross as ISO strings. */
export type AnnotationRow = {
  readonly id: string;
  readonly targetLabel: string;
  readonly structuredReason: AnnotationReason;
  readonly noteText: string;
  readonly supersedesId: string | null;
  readonly createdAt: string;
};

export function AnnotationSection({
  targets,
  rows,
}: {
  /** What a new note may attach to. The first entry is the default. */
  targets: readonly AnnotationTargetOption[];
  rows: readonly AnnotationRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [targetKey, setTargetKey] = useState(0);
  const [reason, setReason] = useState<AnnotationReason>("NOTE");
  const [noteText, setNoteText] = useState("");
  /** Set when revising an existing note; the row it names gets superseded. */
  const [supersedesId, setSupersedesId] = useState<string | null>(null);

  const superseded = new Set(rows.map((r) => r.supersedesId).filter(Boolean));
  const textRequired = REASONS_REQUIRING_TEXT.includes(reason);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const target = targets[targetKey];
      const result = await addAnnotation({
        targetType: target.targetType,
        targetId: target.targetId,
        structuredReason: reason,
        noteText,
        supersedesId: supersedesId ?? undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNoteText("");
      setSupersedesId(null);
      setOpen(false);
      router.refresh();
    });

  return (
    <section className="mt-8">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
        Notes ({rows.length})
      </h2>
      <p className="mt-2 text-[12px] text-muted">
        Why, recorded beside what. A note can be revised — the revision is a new entry and the
        original stays readable — and nothing here changes any figure.
      </p>

      {rows.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => {
            const isSuperseded = superseded.has(row.id);
            return (
              <li
                key={row.id}
                className={`rounded-[6px] border border-line p-3 text-[13px] ${
                  isSuperseded ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-semibold text-ink">
                    {REASON_LABELS[row.structuredReason]}
                  </span>
                  <span className="text-[12px] text-muted">{row.targetLabel}</span>
                  <span className="ml-auto text-[12px] tabular-nums text-muted">
                    {row.createdAt.slice(0, 10)}
                  </span>
                  {isSuperseded && (
                    <span className="rounded-[3px] bg-surface-alt px-[6px] py-[1px] text-[11px] uppercase text-muted">
                      superseded
                    </span>
                  )}
                </div>
                {row.noteText && <p className="mt-1 leading-[1.5] text-ink">{row.noteText}</p>}
                {!isSuperseded && (
                  <button
                    type="button"
                    className="mt-2 text-[12px] font-semibold text-brand"
                    onClick={() => {
                      setSupersedesId(row.id);
                      setTargetKey(Math.max(0, targets.findIndex((t) => t.label === row.targetLabel)));
                      setReason(row.structuredReason);
                      setNoteText(row.noteText);
                      setOpen(true);
                    }}
                  >
                    Revise
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          className="mt-3 h-[36px] rounded-[4px] border border-line px-4 text-[13px] font-semibold text-ink"
          onClick={() => setOpen(true)}
        >
          Add a note
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-3 rounded-[6px] border border-line p-3">
          {supersedesId && (
            <p className="text-[12px] text-muted">
              Revising an earlier note. The original stays on the record, marked superseded.
            </p>
          )}

          {targets.length > 1 && (
            <label className="flex flex-col gap-1 text-[12px] text-muted">
              About
              <select
                value={targetKey}
                disabled={supersedesId !== null}
                onChange={(e) => setTargetKey(Number(e.target.value))}
                className="h-[36px] rounded-[4px] border border-field-line px-2 text-[13px] text-ink"
              >
                {targets.map((t, i) => (
                  <option key={`${t.targetType}:${t.targetId}`} value={i}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1 text-[12px] text-muted">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as AnnotationReason)}
              className="h-[36px] rounded-[4px] border border-field-line px-2 text-[13px] text-ink"
            >
              {ANNOTATION_REASONS.map((value) => (
                <option key={value} value={value}>
                  {REASON_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[12px] text-muted">
            {textRequired ? "In your words (required for this reason)" : "In your words (optional)"}
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              className="rounded-[4px] border border-field-line p-2 text-[13px] text-ink"
              placeholder="Written now rather than reconstructed later."
            />
          </label>

          {error && (
            <p role="alert" className="text-[13px] text-danger-ink">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || (textRequired && noteText.trim().length === 0)}
              onClick={submit}
              className="h-[36px] rounded-[4px] bg-brand px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Recording…" : "Record it"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setSupersedesId(null);
                setNoteText("");
                setError(null);
              }}
              className="h-[36px] rounded-[4px] border border-line px-4 text-[13px] font-semibold text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
