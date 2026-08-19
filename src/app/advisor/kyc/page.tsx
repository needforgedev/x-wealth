import { redirect } from "next/navigation";

import { canOpenStep, nextAdvisorPath } from "@/domain/advisor-onboarding";
import { currentIdentity } from "@/server/identity";
import { KycForm } from "./KycForm";

export const dynamic = "force-dynamic";

/**
 * Server guard, then the form.
 *
 * Two things this stops. Signed-out visitors could open the form and fill it in
 * before discovering they could not submit. And a verified or under-review
 * advisor could deep-link here and be shown a form the action would refuse —
 * `canOpenStep` sends them where they actually belong instead.
 */
export default async function AdvisorKycPage() {
  const identity = await currentIdentity();
  if (!identity) redirect("/");
  if (!identity.advisor) redirect("/");

  if (!canOpenStep(identity.advisor, "KYC")) {
    redirect(nextAdvisorPath(identity.advisor));
  }

  return <KycForm />;
}
