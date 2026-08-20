"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { createGroup } from "@/server/actions/group";

const input =
  "h-[44px] w-full rounded-[4px] border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand";

const SEGMENTS = [
  { value: "EQUITY", label: "Equity" },
  { value: "FNO", label: "F&O" },
  { value: "COMMODITY", label: "Commodity" },
  { value: "CURRENCY", label: "Currency" },
] as const;

export function NewGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [segment, setSegment] = useState<string>("EQUITY");
  const [visibility, setVisibility] = useState<string>("PUBLIC");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await createGroup({ name, description, segment, visibility });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push(`/advisor/groups/${result.data.groupId}/manage`);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
          Name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Positional equity"
          className={`${input} mt-[6px]`}
        />
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
          placeholder="What this group is for, and who it suits."
          className="mt-[6px] w-full rounded-[4px] border border-line bg-surface p-3 text-[15px] text-ink outline-none focus:border-brand"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
            Segment
          </span>
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            className={`${input} mt-[6px]`}
          >
            {SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
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
      </div>

      {visibility === "PRIVATE" && (
        <p className="text-[12px] text-muted">
          A private group does not appear on Discover. You invite people by mobile number from the
          group&rsquo;s members screen, and an invitation waits for whoever signs in with that
          number.
        </p>
      )}

      {error && (
        <p role="alert" className="text-[14px] text-danger-ink">
          {error}
        </p>
      )}

      <PrimaryButton disabled={pending} onClick={submit}>
        {pending ? "Creating…" : "Create group"}
      </PrimaryButton>
    </div>
  );
}
