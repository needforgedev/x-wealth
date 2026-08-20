"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { joinGroup, leaveGroup } from "@/server/actions/group";

/**
 * Join or leave, in one control.
 *
 * Leaving is a status change on the subscription, not a delete — the record
 * that this investor was once in this group survives, which is what makes
 * "what was I shown, and when" answerable later.
 */
export function MembershipButton({
  groupId,
  joined,
  className = "",
}: {
  groupId: string;
  joined: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className={className}>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = joined ? await leaveGroup(groupId) : await joinGroup(groupId);
          if (!result.ok) setError(result.error);
          setPending(false);
          if (result.ok) router.refresh();
        }}
        className={
          joined
            ? "h-[36px] rounded-[4px] border border-line px-4 text-[14px] font-semibold text-muted disabled:opacity-50"
            : "h-[36px] rounded-[4px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50"
        }
      >
        {pending ? "…" : joined ? "Leave" : "Join free"}
      </button>
      {error && (
        <span role="alert" className="mt-1 block text-[12px] text-danger-ink">
          {error}
        </span>
      )}
    </span>
  );
}
