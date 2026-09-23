"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CompileChat } from "@/app/strategies/new/CompileChat";
import { type InstrumentChoice } from "@/domain/strategy";

/**
 * Revise into a new version — by describing the change, not by re-filling a form.
 *
 * ## Why a revision is compiled rather than edited
 *
 * The form asked the author to find the field and retype it. That works, and it
 * quietly invites the thing this product exists to prevent: a form full of
 * editable numbers is an invitation to sweep them, and sweeping parameters
 * against the same history is p-hacking with extra steps. Saying *"widen the
 * stop to 7% because three exits landed inside noise"* is a sentence with a
 * reason in it, and the reason is what the iteration ledger is for.
 *
 * ## What the compiler is not trusted with
 *
 * Scope. A model told to widen a stop can re-round the sizing on the way past,
 * and a rendered rule set shows what the rules *now are*, not what moved. So
 * the screen shows a field-level diff computed from the recorded version —
 * `diffDefinitions`, server-side, against the head version read by id. The
 * prompt asks the model to change one thing; the diff is how the user checks.
 *
 * `strategy_versions` is append-only, so a version that changed more than its
 * author intended is permanent and its lineage misleading.
 */
export function ReviseForm({
  strategyId,
  versionNo,
  catalogue,
}: {
  strategyId: string;
  versionNo: number;
  catalogue: InstrumentChoice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[44px] w-full rounded-[4px] border border-line text-[15px] font-semibold text-ink"
      >
        Revise into a new version
      </button>
    );
  }

  return (
    <div>
      <p className="mb-4 rounded-[6px] bg-surface-alt p-3 text-[13px] text-muted">
        Describe what you want changed. This adds version {versionNo + 1} — the current one
        stays on the record permanently, and nothing can be removed later.
      </p>
      <CompileChat
        catalogue={catalogue}
        revise={{
          strategyId,
          versionNo,
          onSaved: () => {
            setOpen(false);
            router.refresh();
          },
        }}
      />
      <button
        type="button"
        className="mt-4 text-[13px] text-muted underline"
        onClick={() => setOpen(false)}
      >
        Cancel
      </button>
    </div>
  );
}
