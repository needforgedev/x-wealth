import { redirect } from "next/navigation";

import { canOpenStep, nextPath } from "@/domain/onboarding";
import { currentIdentity } from "@/server/identity";
import { ExperienceForm } from "./ExperienceForm";

export const dynamic = "force-dynamic";

export default async function OnboardingQuestionsPage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");

  const user = identity.user;
  if (!canOpenStep(user, "EXPERIENCE")) redirect(nextPath(user));

  return (
    <ExperienceForm
      initial={user.experienceLevel}
      nextHref={nextPath({ ...user, experienceLevel: "BEGINNER" })}
    />
  );
}
