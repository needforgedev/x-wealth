import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { TopBar } from "@/components/TopBar";
import { currentIdentity } from "@/server/identity";

export const dynamic = "force-dynamic";

/**
 * Portfolio — an honest stub, and deliberately empty.
 *
 * ## What was here
 *
 * A fabricated portfolio: ₹345,000 in value, 23% change, a 44% CAGR, and five
 * holdings each showing a 23% gain, rendered to whoever opened the page. Plus a
 * "Via Signals" filter tab and an "Add Stock" sheet whose submit button was a
 * link back to this page.
 *
 * Three separate problems, and none of them was visible to CI because this
 * screen imports no schema — the same blind spot that kept "certified experts"
 * on the landing page through the entire identity collapse.
 *
 *   - **§8.7 and §10.** Platform-authored performance figures, as seed data.
 *     A fabricated 44% CAGR on a page a user reaches while signed in is the
 *     same defect as the landing page's, in numbers rather than words — which
 *     is exactly why the performance-claims lint rule could not see it.
 *   - **§8.5.** "Via Signals" is the distribution surface. Signals were removed
 *     in W10-15 and the filter that sorted holdings by them outlived them.
 *   - **No auth guard.** A signed-out visitor could open this and read it.
 *
 * ## Why a stub rather than a build
 *
 * `portfolio_entries` exists and holds nothing; no query reads it and no action
 * writes it. Wiring real holdings is `W19` — position sizing, exposure,
 * concentration and the circuit breakers are the reason the table exists, and a
 * holdings list built ahead of them would be a list of numbers with no limits
 * behind it.
 *
 * **Do not fill this space in the meantime** (the rule W10-20 set for the old
 * investor home). A screen that furnishes its own emptiness starts implying a
 * capability that is not there, and this one already did that once.
 */
export default async function PortfolioPage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");

  return (
    <AppShell className="bg-surface-alt">
      <TopBar showBack backHref="/home" />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">Portfolio</h1>

        <p className="mt-4 rounded-[6px] bg-surface p-4 text-[13px] text-muted">
          Not built yet. This will show what you actually hold, alongside the exposure and
          concentration limits that decide whether a new position may be opened at all — the two
          belong on one screen, because a holding list without limits behind it is just a list of
          numbers.
        </p>

        <p className="mt-3 text-[13px] text-muted">
          Until then, your strategies and their tests are on the home screen.
        </p>
      </div>

      <BottomNav />
    </AppShell>
  );
}
