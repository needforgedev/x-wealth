import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { registrationGate } from "@/domain/registration-gate";
import { currentIdentity } from "@/server/identity";
import { NewStrategyForm } from "./NewStrategyForm";

export const dynamic = "force-dynamic";

export default async function NewStrategyPage() {
  const identity = await currentIdentity();
  if (!identity?.advisor) redirect("/");
  if (!registrationGate(identity.advisor).allowed) redirect("/advisor/status");

  return (
    <AppShell>
      <AppBar backHref="/advisor/home" />
      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">New strategy</h1>
        <p className="mt-[6px] text-[14px] text-muted">
          Rules, then the hypothesis you intend to test. Both are recorded before any result
          exists — that ordering is the point.
        </p>
        <div className="mt-6">
          <NewStrategyForm />
        </div>
      </div>
    </AppShell>
  );
}
