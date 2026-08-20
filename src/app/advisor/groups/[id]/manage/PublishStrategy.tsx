"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { publishStrategyToGroup } from "@/server/actions/group";

/**
 * Puts one of the advisor's own strategies into this group.
 *
 * The list only ever contains strategies they authored and have not already
 * published here — the server re-checks both, because a select element is not
 * an authorisation.
 */
export function PublishStrategy({
  groupId,
  available,
}: {
  groupId: string;
  available: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [strategyId, setStrategyId] = useState(available[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (available.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        Every strategy you have authored is already in this group.
      </p>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <select
          aria-label="Strategy to publish"
          value={strategyId}
          onChange={(e) => setStrategyId(e.target.value)}
          className="h-[44px] min-w-0 flex-1 rounded-[4px] border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand"
        >
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !strategyId}
          onClick={async () => {
            setPending(true);
            setError(null);
            const result = await publishStrategyToGroup({ groupId, strategyId });
            if (!result.ok) setError(result.error);
            setPending(false);
            if (result.ok) router.refresh();
          }}
          className="h-[44px] shrink-0 rounded-[4px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Publishing…" : "Publish"}
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
