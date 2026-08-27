import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { hasAcknowledgedRisk, nextInvestorPath } from "@/domain/investor-onboarding";
import { currentIdentity } from "@/server/identity";
import { SignOutButton } from "@/app/advisor/status/SignOutButton";

export const dynamic = "force-dynamic";

/**
 * The landing page after onboarding — currently close to empty, deliberately.
 *
 * It used to list joined groups, pending invitations and a Discover button.
 * Every one of those was the distribution surface: `CLAUDE.md` §8.5 makes a
 * user's strategies and signals private to them, and §2 records that
 * user-to-user sharing is prohibited outright rather than merely risky. The
 * routes behind those links are gone (`plan.md` W10-15).
 *
 * What replaces them is not more content. Under v2 there is one persona — a
 * retail trader authoring and testing their own strategies — so this page's
 * successor is the strategy list, which already exists at `/advisor/home`.
 * Pointing there now would be wrong: it needs an advisor row, and the two
 * identities do not merge until W24.
 *
 * So this stays a stub until then. An honest empty screen is the correct
 * output for a product that has removed a feature and not yet built its
 * replacement — inventing something to fill the space is how a screen starts
 * implying a capability that is not there.
 */
export default async function InvestorHomePage() {
  const identity = await currentIdentity();
  if (!identity?.investor) redirect("/");

  const investor = identity.investor;
  if (!hasAcknowledgedRisk(investor)) redirect(nextInvestorPath(investor));

  return (
    <AppShell>
      <AppBar showBack={false} />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">
          {investor.contactName ?? "Account"}
        </h1>
        <p className="mt-[2px] text-[14px] text-muted">
          {investor.experienceLevel
            ? investor.experienceLevel.replace("_", " ").toLowerCase()
            : "—"}
        </p>

        <div className="mt-8 rounded-[8px] border border-dashed border-line p-6 text-center">
          <p className="text-[15px] text-ink">Nothing here yet.</p>
          <p className="mt-2 text-[13px] leading-[1.5] text-muted">
            X-Wealth is a strategy lab: you describe an idea, test it against history net of
            costs, then run it forward on paper before it ever sees real money. Strategy
            authoring is being moved onto this account.
          </p>
        </div>

        <div className="mt-8 rounded-[6px] bg-surface-alt p-4">
          <p className="text-[13px] leading-[1.5] text-muted">
            Risk disclosure acknowledged{" "}
            {investor.riskAckAt ? investor.riskAckAt.toISOString().slice(0, 10) : ""}. X-Wealth
            never places an order and never holds your money — anything you eventually run live
            runs in your own broker account, under your own credentials.
          </p>
        </div>

        <div className="mt-auto pt-8">
          <SignOutButton />
        </div>
      </div>
    </AppShell>
  );
}
