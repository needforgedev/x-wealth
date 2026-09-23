import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { hasAcknowledgedRisk, nextPath } from "@/domain/onboarding";
import { currentIdentity } from "@/server/identity";
import { loadCatalogue } from "@/server/market-data/catalogue";

import { CompileChat } from "./CompileChat";

export const dynamic = "force-dynamic";

/**
 * Authoring a strategy, and there is only one way in.
 *
 * The hand-filled form that used to live here is gone as of 23 Sep 2026. It was
 * not removed because it was broken — it worked, and `ReviseForm` still uses
 * the same component to edit an existing version. It was removed because
 * offering both made the compiler look like a shortcut past the six mandatory
 * components rather than the way to reach them, and a user who suspects the
 * fast path is the lesser one will take the slow path and resent it.
 *
 * Nothing about the guarantees changes. `compileStrategy` proposes, the user
 * reviews every rule and presses save, and `createStrategy` validates exactly
 * what it always validated. The compiler is a better keyboard, not a lower bar.
 */
export default async function NewStrategyPage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  if (!hasAcknowledgedRisk(identity.user)) redirect(nextPath(identity.user));

  // Read here rather than from the client: the same list the compiler is shown
  // is the one `createStrategy` validates against, so the two cannot drift.
  const catalogue = await loadCatalogue();

  return (
    <AppShell>
      <AppBar backHref="/home" />
      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">New strategy</h1>
        <p className="mt-[6px] text-[14px] text-muted">
          Describe the idea in plain English. It compiles what you say — it will not pick
          instruments for you, and it asks rather than inventing anything you leave out.
        </p>
        <div className="mt-6">
          <CompileChat catalogue={catalogue} />
        </div>
      </div>
    </AppShell>
  );
}
