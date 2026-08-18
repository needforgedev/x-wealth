"use client";

import { useRouter } from "next/navigation";

import { GroupFormFields } from "@/components/advisor/GroupFormFields";
import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

/**
 * The advisor's first group. Same field set as Edit Group Info plus the tags
 * and public-URL rows, which only appear while the group is being created.
 */
export default function AdvisorCreateGroupPage() {
  const router = useRouter();

  return (
    <AppShell>
      <AppBar backHref="/advisor/kyc" />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[50px] text-center text-[20px] font-semibold capitalize text-ink">
          Create Group
        </h1>
        <p className="mt-[6px] text-center text-[18px] text-muted">Create your first Group</p>

        <GroupFormFields className="mt-[26px]" showTagsAndUrl />

        <PrimaryButton className="mt-[19px]" onClick={() => router.push("/advisor/pricing")}>
          Continue
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
