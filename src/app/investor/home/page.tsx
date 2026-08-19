import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { hasAcknowledgedRisk, nextInvestorPath } from "@/domain/investor-onboarding";
import { currentIdentity } from "@/server/identity";
import { SignOutButton } from "@/app/advisor/status/SignOutButton";

export const dynamic = "force-dynamic";

/**
 * The investor's landing page.
 *
 * There is nothing to discover yet, and this says so plainly rather than
 * filling the screen with placeholder groups. A strategy only becomes
 * discoverable after a completed forward test (PRD §5.7, §5.10), and the
 * forward-test engine does not exist — so an empty list here is the honest
 * state of the product, not a bug.
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
          {investor.contactName ?? "Investor"}
        </h1>
        <p className="mt-[2px] text-[14px] text-muted">
          {investor.experienceLevel
            ? investor.experienceLevel.replace("_", " ").toLowerCase()
            : "—"}
          {investor.interests?.length ? ` · ${investor.interests.join(", ")}` : ""}
        </p>

        <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Strategies
        </h2>

        <div className="mt-3 rounded-[8px] border border-dashed border-line p-6">
          <p className="text-[15px] text-ink">Nothing published yet.</p>
          <p className="mt-2 text-[13px] text-muted">
            A strategy appears here only after an advisor has run it forward on paper for a full
            window and published the complete record — every version, every test, including the
            ones they abandoned.
          </p>
          <p className="mt-3 text-[13px] text-muted">
            No advisor has completed one, because the forward-test engine is still being built.
            Showing you sample groups here would be inventing a track record, which is the exact
            thing this product exists to stop.
          </p>
        </div>

        <div className="mt-6 rounded-[6px] bg-surface-alt p-4">
          <p className="text-[13px] text-muted">
            Risk disclosure acknowledged{" "}
            {investor.riskAckAt ? investor.riskAckAt.toISOString().slice(0, 10) : ""}. You can act
            on signals only in your own broker account — X-Wealth never places an order and never
            holds your money.
          </p>
        </div>

        <div className="mt-auto pt-8">
          <SignOutButton />
        </div>
      </div>
    </AppShell>
  );
}
