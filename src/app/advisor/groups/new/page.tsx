import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { registrationGate } from "@/domain/registration-gate";
import { currentIdentity } from "@/server/identity";
import { NewGroupForm } from "./NewGroupForm";

export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
  const identity = await currentIdentity();
  if (!identity?.advisor) redirect("/");

  const gate = registrationGate(identity.advisor);
  if (!gate.allowed) redirect("/advisor/status");

  return (
    <AppShell>
      <AppBar backHref="/advisor/groups" />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">New group</h1>
        <p className="mt-[4px] text-[14px] text-muted">
          Joining is free while payments are unresolved, so anyone who finds a public group can
          join it. Choose the segment carefully — it is fixed once the group exists.
        </p>

        <div className="mt-6">
          <NewGroupForm />
        </div>
      </div>
    </AppShell>
  );
}
