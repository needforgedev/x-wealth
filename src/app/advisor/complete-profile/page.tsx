import { redirect } from "next/navigation";

import { nextAdvisorPath } from "@/domain/advisor-onboarding";
import { currentIdentity } from "@/server/identity";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

/**
 * Server guard, then the form.
 *
 * Signed-out visitors used to reach this page and see an onboarding form they
 * could not submit. Editing your own profile stays open at any stage, so a
 * verified advisor can correct a typo — but after saving they go wherever they
 * actually belong, not blindly on to KYC.
 */
export default async function AdvisorCompleteProfilePage() {
  const identity = await currentIdentity();
  if (!identity) redirect("/");
  if (!identity.advisor) redirect("/");

  const advisor = identity.advisor;
  const [firstName = "", ...rest] = (advisor.contactName ?? "").split(" ");

  return (
    <ProfileForm
      initial={{ firstName, lastName: rest.join(" "), email: advisor.contactEmail ?? "" }}
      nextHref={nextAdvisorPath({
        // Assume the save succeeds — it is what sends us onward.
        contactName: "set",
        contactEmail: "set",
        verificationStatus: advisor.verificationStatus,
      })}
    />
  );
}
