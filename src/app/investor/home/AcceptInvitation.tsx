"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { acceptInvitation } from "@/server/actions/invitation";

/**
 * Accepting is joining. There is no separate "accept then join" step, because a
 * half-done invitation is the worst outcome available: the offer is spent and
 * the group is private, so the person is locked out of something they were
 * invited to. The action does both in one transaction.
 */
export function AcceptInvitation({ invitationId }: { invitationId: string }) {
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
          const result = await acceptInvitation(invitationId);
          if (!result.ok) {
            setError(result.error);
            setPending(false);
            return;
          }
          router.push(`/investor/groups/${result.data.groupId}`);
        }}
        className="h-[36px] rounded-[4px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? "…" : "Accept"}
      </button>
      {error && (
        <span role="alert" className="mt-1 block text-[12px] text-danger-ink">
          {error}
        </span>
      )}
    </span>
  );
}
