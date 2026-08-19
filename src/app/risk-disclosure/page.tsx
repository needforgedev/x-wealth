import { redirect } from "next/navigation";

import { canOpenInvestorStep, nextInvestorPath } from "@/domain/investor-onboarding";
import { currentIdentity } from "@/server/identity";
import { RiskForm } from "./RiskForm";

export const dynamic = "force-dynamic";

export default async function RiskDisclosurePage() {
  const identity = await currentIdentity();
  if (!identity?.investor) redirect("/");

  const investor = identity.investor;
  if (!canOpenInvestorStep(investor, "RISK")) redirect(nextInvestorPath(investor));

  return <RiskForm />;
}
