"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TextField } from "@/components/ui/TextField";

/**
 * Complete Profile — name and email, and deliberately nothing else.
 *
 * ## Why there is no date of birth or gender here
 *
 * There were, until 23 Sep 2026: two `readOnly` fields carrying a chevron and a
 * placeholder written to read as a value ("19-08-1998", "Male"). They held no
 * state, saved nothing, and opened no picker. The screen looked complete and
 * two of its five fields were decoration — the same failure as the hardcoded
 * "Raj Bansal" profile, and invisible to CI for the same reason: this file
 * imports no schema.
 *
 * They were removed rather than wired up, which is the part worth recording.
 * **Neither has a column**, in the live schema or in `CLAUDE.md` §9, and no
 * feature reads age or gender — the KYC that once justified them went with W2.
 * Date of birth is PII that §12 requires encrypted at rest, access-logged and
 * kept out of every log and error message. Collecting it to satisfy a form
 * layout would buy that obligation and nothing else.
 */
type Placeholders = {
  firstName: string;
  lastName: string;
  email: string;
};

const DEFAULT_PLACEHOLDERS: Placeholders = {
  firstName: "Yash",
  lastName: "Bhardwaj",
  email: "you@example.com",
};

export function CompleteProfileScreenBody({
  backHref,
  nextHref,
  placeholders = DEFAULT_PLACEHOLDERS,
  onSubmit,
  initial,
}: {
  backHref: string;
  nextHref: string;
  /** The Alpha artboard labels the same fields with prompts, not sample values. */
  placeholders?: Placeholders;
  /**
   * Live save. When omitted the screen just navigates — how the investor and
   * Alpha artboards still behave.
   */
  onSubmit?: (values: { firstName: string; lastName: string; email: string }) => Promise<string | null>;
  /** Existing values, so a returning advisor edits rather than retypes. */
  initial?: { firstName?: string; lastName?: string; email?: string };
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(true);
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setError(null);
    if (!onSubmit) {
      router.push(nextHref);
      return;
    }
    setPending(true);
    const failure = await onSubmit({ firstName, lastName, email });
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    router.push(nextHref);
  };

  return (
    <AppShell>
      <AppBar backHref={backHref} />

      <div className="flex flex-1 flex-col px-5">
        <h1 className="mt-[50px] text-center text-[20px] font-semibold capitalize text-ink">
          Complete Profile
        </h1>
        <p className="mt-[6px] text-center text-[18px] text-muted">Enter your details</p>

        <div className="mt-6 flex flex-col items-center">
          <Avatar initials="YB" />
          <button type="button" className="mt-[37px] flex items-center gap-[9px]">
            <Image
              src="/assets/icon-add-photo.svg"
              alt=""
              width={16}
              height={16}
              unoptimized
              className="size-[15.75px]"
            />
            <span className="text-[12px] font-semibold uppercase text-muted">
              Choose picture
            </span>
          </button>
        </div>

        <div className="mt-[50px] grid grid-cols-2 gap-x-[9px] gap-y-[19px]">
          <TextField
            label="First name"
            autoComplete="given-name"
            placeholder={placeholders.firstName}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <TextField
            label="Last name"
            autoComplete="family-name"
            placeholder={placeholders.lastName}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <TextField
            containerClassName="col-span-2"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder={placeholders.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <Checkbox className="mt-[28px]" checked={agreed} onCheckedChange={setAgreed}>
          By using the App, you agree to our{" "}
          <span className="font-medium underline">Terms &amp; Conditions</span>
        </Checkbox>

        {error && (
          <p role="alert" className="mt-3 text-center text-[14px] text-danger-ink">
            {error}
          </p>
        )}

        <PrimaryButton
          className="mt-auto mb-[calc(29px+env(safe-area-inset-bottom))]"
          disabled={pending || !agreed}
          onClick={submit}
        >
          {pending ? "Saving…" : "Continue"}
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
