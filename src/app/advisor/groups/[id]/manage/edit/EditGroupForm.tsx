"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { updateGroup } from "@/server/actions/group";

const input =
  "h-[44px] w-full rounded-[4px] border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand";

export function EditGroupForm({
  group,
}: {
  group: { id: string; name: string; description: string | null; visibility: string; segment: string };
}) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [visibility, setVisibility] = useState(group.visibility);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await updateGroup({ groupId: group.id, name, description, visibility });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push(`/advisor/groups/${group.id}/manage`);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
          Name
        </span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-[6px]`} />
      </label>

      <label className="block">
        <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
          Description
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          className="mt-[6px] w-full rounded-[4px] border border-line bg-surface p-3 text-[15px] text-ink outline-none focus:border-brand"
        />
      </label>

      <label className="block">
        <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
          Visibility
        </span>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          className={`${input} mt-[6px]`}
        >
          <option value="PUBLIC">Public — anyone can join</option>
          <option value="PRIVATE">Private — invitation only</option>
        </select>
      </label>

      {visibility === "PRIVATE" && group.visibility === "PUBLIC" && (
        <p className="text-[12px] text-muted">
          Existing members stay. Making it private only stops new people finding and joining it —
          invite them by number instead.
        </p>
      )}

      {/*
        Segment is shown and not editable. Strategies were published into this
        group on the understanding of what it trades; changing that under the
        people who joined would silently re-describe what they signed up for.
      */}
      <div>
        <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
          Segment
        </span>
        <p className="mt-[6px] flex h-[44px] items-center rounded-[4px] bg-surface-alt px-3 text-[15px] text-muted">
          {group.segment}
        </p>
        <span className="mt-[5px] block text-[12px] text-muted">
          Fixed at creation. Make a new group to distribute a different segment.
        </span>
      </div>

      {error && (
        <p role="alert" className="text-[14px] text-danger-ink">
          {error}
        </p>
      )}

      <PrimaryButton disabled={pending} onClick={submit}>
        {pending ? "Saving…" : "Save changes"}
      </PrimaryButton>
    </div>
  );
}
