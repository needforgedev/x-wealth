"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { signOut } from "@/server/actions/auth";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOut();
          router.push("/");
          router.refresh();
        })
      }
      className="text-[14px] font-semibold text-muted"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
