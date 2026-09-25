import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { hasAcknowledgedRisk, nextPath } from "@/domain/onboarding";
import { currentIdentity } from "@/server/identity";

import { WorkbenchChat } from "./WorkbenchChat";

export const dynamic = "force-dynamic";

/**
 * The hypothesis workbench — step 1 of the loop. `plan.md` W15-08, §7.2.
 *
 * Deliberately the one screen in the product that reads no data at all: no
 * catalogue, no bars, no strategies, no results. A hypothesis is a claim made
 * before looking, and this page is arranged so that nothing here has looked.
 */
export default async function WorkbenchPage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  if (!hasAcknowledgedRisk(identity.user)) redirect(nextPath(identity.user));

  return (
    <AppShell>
      <AppBar backHref="/home" />
      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">Hypothesis workbench</h1>
        <p className="mt-[6px] text-[14px] text-muted">
          Before rules and before data: say what you expect to happen, and the workbench helps you
          state it so a forward test can prove it wrong. It sees no prices and invents no
          statistics — it sharpens what you say, questions the premise, and stops.
        </p>
        <div className="mt-6">
          <WorkbenchChat />
        </div>
      </div>
    </AppShell>
  );
}
