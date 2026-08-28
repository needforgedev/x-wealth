"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { MaskIcon } from "@/components/ui/MaskIcon";
import { saveProfile } from "@/server/actions/profile";

/**
 * Editing the name and email on the account.
 *
 * This screen used to be three uncontrolled inputs pre-filled from a fixture,
 * with an "Update Profile" button that was a `<Link href="/profile">`. Typing
 * into it and pressing the button navigated away and discarded everything —
 * a form that silently does nothing, which reads as a saved change.
 *
 * `saveProfile` already existed and was already wired to onboarding, so this is
 * the same action the account's first screen uses. One write path, not two that
 * can disagree about what a valid name is.
 *
 * There is no bio field. `users` has no bio column (`CLAUDE.md` §9) and adding
 * one to hold a sentence nothing reads would be inventing a feature to justify
 * an input that came from a Figma artboard.
 */
export function EditProfileForm({
  initial,
}: {
  initial: { fullName: string; email: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email);
  const [error, setError] = useState<string | null>(null);

  const dirty = fullName !== initial.fullName || email !== initial.email;

  return (
    <>
      <div className="mt-[37px] flex flex-col gap-[20px]">
        <Field id="edit-full-name" label="Full Name" value={fullName} onChange={setFullName} />
        <Field
          id="edit-email"
          label="Email Address"
          value={email}
          onChange={setEmail}
          type="email"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[14px] text-danger-ink">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={pending || !dirty}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await saveProfile({ fullName, email });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push("/profile");
            router.refresh();
          })
        }
        className="mt-auto flex h-[45.78px] w-full items-center justify-center rounded-[5px] bg-brand text-[18px] font-medium uppercase text-white disabled:opacity-50"
      >
        <span>{pending ? "Saving…" : "Update Profile"}</span>
        {!pending && (
          <span className="ml-[14px] flex size-[21px] shrink-0 items-center justify-center">
            <MaskIcon src="/assets/icon-arrow-forward.svg" width={21} height={21} />
          </span>
        )}
      </button>
    </>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[17px] text-ink-soft">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-[12px] h-[46.66px] w-full rounded-[2px] border border-field-line bg-transparent px-[17px] text-[17px] text-ink-strong outline-none focus:border-brand"
      />
    </div>
  );
}
