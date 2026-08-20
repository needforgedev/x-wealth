"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { withdrawStrategyFromGroup } from "@/server/actions/group";

/**
 * Stops distributing a strategy to this group.
 *
 * The wording is "withdraw", not "remove", because nothing is removed: the
 * strategy and its whole history stay on the advisor's record, and the link row
 * stays too, stamped with when it ended.
 */
export function WithdrawButton({ groupId, strategyId }: { groupId: string; strategyId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="shrink-0 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await withdrawStrategyFromGroup({ groupId, strategyId });
          if (!result.ok) setError(result.error);
          setPending(false);
          if (result.ok) router.refresh();
        }}
        className="text-[13px] font-semibold text-muted disabled:opacity-50"
      >
        {pending ? "Withdrawing…" : "Withdraw"}
      </button>
      {error && (
        <span role="alert" className="mt-1 block text-[12px] text-danger-ink">
          {error}
        </span>
      )}
    </span>
  );
}
