"use client";

import { useRouter } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { GroupCard } from "@/components/GroupCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { INVITED_GROUPS } from "@/lib/groups";

export default function GroupInvitationsPage() {
  const router = useRouter();

  return (
    <AppShell className="bg-brand">
      <AppBar backHref="/choose-interests" tone="inverse" />

      <div className="flex flex-1 flex-col px-5">
        <h1 className="mt-[50px] text-center text-[20px] font-semibold capitalize text-white">
          You are invited to
        </h1>
        <p className="mt-[6px] text-center text-[18px] text-white">These Groups</p>

        <div className="mt-[50px] flex flex-col gap-[15px]">
          {INVITED_GROUPS.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>

        <PrimaryButton
          variant="inverse"
          className="mt-auto mb-[calc(29px+env(safe-area-inset-bottom))]"
          onClick={() => router.push("/chats")}
        >
          Join &amp; Continue
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
