import { redirect } from "next/navigation";

import { canOpenInvestorStep, nextInvestorPath } from "@/domain/investor-onboarding";
import { currentIdentity } from "@/server/identity";
import { ExperienceForm } from "./ExperienceForm";

export const dynamic = "force-dynamic";

export default async function OnboardingQuestionsPage() {
  const identity = await currentIdentity();
  if (!identity?.investor) redirect("/");

  const investor = identity.investor;
  if (!canOpenInvestorStep(investor, "EXPERIENCE")) redirect(nextInvestorPath(investor));

  return (
    <ExperienceForm
      initial={investor.experienceLevel}
      nextHref={nextInvestorPath({ ...investor, experienceLevel: "BEGINNER" })}
    />
  );
}
