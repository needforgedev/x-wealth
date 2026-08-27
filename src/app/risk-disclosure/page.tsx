import { redirect } from "next/navigation";

import { canOpenStep, nextPath } from "@/domain/onboarding";
import { currentIdentity } from "@/server/identity";
import { RiskForm } from "./RiskForm";

export const dynamic = "force-dynamic";

export default async function RiskDisclosurePage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");

  const user = identity.user;
  if (!canOpenStep(user, "RISK")) redirect(nextPath(user));

  return <RiskForm />;
}
