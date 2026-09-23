import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { hasAcknowledgedRisk, nextPath } from "@/domain/onboarding";
import { currentIdentity } from "@/server/identity";
import { loadCatalogue } from "@/server/market-data/catalogue";

import { CompileChat } from "./CompileChat";

export const dynamic = "force-dynamic";

export default async function CompileStrategyPage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  if (!hasAcknowledgedRisk(identity.user)) redirect(nextPath(identity.user));

  // Read here rather than from the client: the same list the compiler is shown
  // is the one `createStrategy` validates against, so they cannot drift.
  const catalogue = await loadCatalogue();

  return (
    <AppShell>
      <AppBar backHref="/strategies/new" />
      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">Describe the idea</h1>
        <p className="mt-[6px] text-[14px] text-muted">
          Plain English in, a rule set out. It compiles what you say — it will not pick
          instruments for you, and it asks rather than inventing anything you left out.
        </p>
        <div className="mt-6">
          <CompileChat catalogue={catalogue} />
        </div>
      </div>
    </AppShell>
  );
}
