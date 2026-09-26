/**
 * Annotations: why, recorded beside what, never instead of it.
 * `plan.md` W17, `CLAUDE.md` §7.5 and §8.8.
 *
 * ## What an annotation is
 *
 * The record tables state what happened — a trade, a test, a version. An
 * annotation states why, in the author's own words, at the time. §8.8 draws
 * the line this module lives on: **annotations never alter facts.** They are
 * separate append-only rows; editing one appends a replacement that names
 * what it supersedes, and nothing is ever overwritten.
 *
 * ## Why "at the time" is the whole point (W17-06)
 *
 * Execution-gap analysis (W21) attributes the distance between what the
 * strategy signalled and what the person did — and it cannot attribute a
 * skipped signal without a reason recorded when the skip happened. A reason
 * reconstructed after the outcome is known is not a record, it is a story,
 * and stories are kind to their narrators. Shipping this layer early is what
 * makes contemporaneous reasons possible at all.
 *
 * ## The taxonomy is structured first, prose second
 *
 * §7.5 fixes the reason lists. The structured value is the half a machine can
 * aggregate ("14 of 61 signals skipped, 9 on distrust"); the free text is the
 * half a person needs when reading their own record months later. OTHER and
 * NOTE exist so nothing true is forced into a category that misdescribes it —
 * and the schema requires text on exactly those values, because "other" with
 * no words says nothing at all.
 */

/** What an annotation can attach to. Grows when signals exist (W20/W23). */
export const ANNOTATION_TARGETS = ["STRATEGY_VERSION", "FORWARD_TEST", "PAPER_TRADE"] as const;
export type AnnotationTarget = (typeof ANNOTATION_TARGETS)[number];

/**
 * The §7.5 lists, verbatim, plus NOTE.
 *
 * NOTE is the reason for an annotation that is neither a skip nor an
 * override — a journal line on a test or a version ("stopped adding capital
 * context here", "authored after reading test X's post-mortem"). The two
 * spec'd families describe deviations from signals; a record layer that only
 * accepted deviations would leave everything else unrecorded, which is how
 * reasons end up reconstructed later.
 */
export const ANNOTATION_REASONS = [
  // Skip — a signal existed and was not taken.
  "SKIP_NEWS_EVENT",
  "SKIP_DID_NOT_TRUST",
  "SKIP_ALREADY_EXPOSED",
  "SKIP_INSUFFICIENT_CAPITAL",
  "SKIP_MISSED_WINDOW",
  "SKIP_OTHER",
  // Override — an action was taken, differently from the signal.
  "OVERRIDE_SIZED_UP_CONVICTION",
  "OVERRIDE_SIZED_DOWN_UNCERTAINTY",
  "OVERRIDE_EARLY_EXIT_FEAR",
  "OVERRIDE_EARLY_EXIT_INFORMATION",
  "OVERRIDE_OTHER",
  // Neither — a contemporaneous note on the record.
  "NOTE",
] as const;
export type AnnotationReason = (typeof ANNOTATION_REASONS)[number];

export type ReasonFamily = "SKIP" | "OVERRIDE" | "NOTE";

export function reasonFamily(reason: AnnotationReason): ReasonFamily {
  if (reason.startsWith("SKIP_")) return "SKIP";
  if (reason.startsWith("OVERRIDE_")) return "OVERRIDE";
  return "NOTE";
}

/** The values on which free text is mandatory — a bare "other" says nothing. */
export const REASONS_REQUIRING_TEXT: readonly AnnotationReason[] = [
  "SKIP_OTHER",
  "OVERRIDE_OTHER",
  "NOTE",
];

/**
 * Screen labels. Deliberately the spec's own words (§7.5) rather than
 * rephrasings, so the record and the document describing it stay one
 * vocabulary.
 */
export const REASON_LABELS: Record<AnnotationReason, string> = {
  SKIP_NEWS_EVENT: "Skipped — news event",
  SKIP_DID_NOT_TRUST: "Skipped — didn't trust it",
  SKIP_ALREADY_EXPOSED: "Skipped — already exposed",
  SKIP_INSUFFICIENT_CAPITAL: "Skipped — insufficient capital",
  SKIP_MISSED_WINDOW: "Skipped — missed the window",
  SKIP_OTHER: "Skipped — other",
  OVERRIDE_SIZED_UP_CONVICTION: "Override — sized up on conviction",
  OVERRIDE_SIZED_DOWN_UNCERTAINTY: "Override — sized down on uncertainty",
  OVERRIDE_EARLY_EXIT_FEAR: "Override — early exit on fear",
  OVERRIDE_EARLY_EXIT_INFORMATION: "Override — early exit on other information",
  OVERRIDE_OTHER: "Override — other",
  NOTE: "Note",
};

/** Bounds for the free text. Generous, but a note is not a document. */
export const NOTE_TEXT_MAX = 2_000;

export type AnnotationIssue = { readonly field: string; readonly message: string };

/**
 * Application-level validation, shared by the action and its tests. The
 * database enforces the same rules again in migration `0017` — this exists so
 * the user sees a sentence instead of a constraint name.
 */
export function validateAnnotation(input: {
  readonly reason: string;
  readonly noteText: string;
}): AnnotationIssue[] {
  const issues: AnnotationIssue[] = [];
  const reason = input.reason as AnnotationReason;

  if (!ANNOTATION_REASONS.includes(reason)) {
    issues.push({ field: "reason", message: "Pick a reason from the list." });
    return issues;
  }

  const text = input.noteText.trim();
  if (text.length > NOTE_TEXT_MAX) {
    issues.push({ field: "noteText", message: `Keep the note under ${NOTE_TEXT_MAX} characters.` });
  }
  if (text.length === 0 && REASONS_REQUIRING_TEXT.includes(reason)) {
    issues.push({
      field: "noteText",
      message: "Say it in words — this reason carries no meaning on its own.",
    });
  }

  return issues;
}
