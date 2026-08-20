"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { inviteToGroup, revokeInvitation } from "@/server/actions/invitation";

/**
 * Invite by phone number.
 *
 * The number, not an account: the people an advisor wants to bring across from
 * a Telegram channel mostly have no account here yet. The invitation waits for
 * whoever signs in with that number.
 */
export function InviteForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="10-digit mobile number"
          aria-label="Mobile number to invite"
          className="h-[44px] min-w-0 flex-1 rounded-[4px] border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand"
        />
        <button
          type="button"
          disabled={pending || phone.trim() === ""}
          onClick={async () => {
            setPending(true);
            setError(null);
            const result = await inviteToGroup({ groupId, phone });
            setPending(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setPhone("");
            router.refresh();
          }}
          className="h-[44px] shrink-0 rounded-[4px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Inviting…" : "Invite"}
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

export function RevokeButton({ invitationId }: { invitationId: string }) {
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
          const result = await revokeInvitation(invitationId);
          if (!result.ok) setError(result.error);
          setPending(false);
          if (result.ok) router.refresh();
        }}
        className="text-[13px] font-semibold text-muted disabled:opacity-50"
      >
        {pending ? "…" : "Revoke"}
      </button>
      {error && (
        <span role="alert" className="mt-1 block text-[12px] text-danger-ink">
          {error}
        </span>
      )}
    </span>
  );
}
