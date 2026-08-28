"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { MaskIcon } from "@/components/ui/MaskIcon";
import { signOut } from "@/server/actions/auth";

/**
 * Sign out, for real.
 *
 * The confirmation sheet used to end in `<Link href="/">`, which navigated to
 * the landing page and left the session entirely intact — the cookie survived,
 * `currentUser()` still resolved, and typing any protected URL walked straight
 * back in. It *looked* like signing out, which is the worst version of that
 * bug: on a shared or borrowed device the user believes they are out.
 *
 * `signOut` has existed in `src/server/actions/auth.ts` the whole time, and so
 * had a `SignOutButton` component. Both were orphaned: the button was built for
 * the `/account/*` screens, those routes went in W10-15, and the profile
 * screens kept their own v1 `<Link>` instead. So the wiring was written, then
 * detached, and what stayed on screen was the version that did nothing. The
 * orphan is deleted rather than left as a second way to do this.
 *
 * `router.refresh()` after the redirect is not optional. Every guarded page is
 * `force-dynamic` but the client router still holds rendered payloads from the
 * signed-in session, and without the refresh a back-navigation redraws them
 * from cache.
 */
export function SignOut({
  variant = "row",
  label = "Logout",
}: {
  /** `row` is the settings-list item; `primary` is the sheet's confirm button. */
  variant?: "row" | "primary";
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      await signOut();
      router.replace("/");
      router.refresh();
    });

  if (variant === "primary") {
    return (
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="flex h-[42.93px] w-full items-center justify-center rounded-[6px] border border-danger-ink/40 text-[16px] font-medium text-danger-ink disabled:opacity-50"
      >
        {pending ? "Signing out…" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="flex w-full items-center justify-center gap-[19px] py-[15px] text-menu-ink disabled:opacity-50"
    >
      <span className="flex size-[24px] shrink-0 items-center justify-center">
        <MaskIcon src="/assets/icon-logout.svg" width={24} height={24} />
      </span>
      <span className="text-[16px] font-medium">{pending ? "Signing out…" : label}</span>
    </button>
  );
}
