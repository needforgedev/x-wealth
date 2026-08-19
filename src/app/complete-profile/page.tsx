import { redirect } from "next/navigation";

import { nextInvestorPath } from "@/domain/investor-onboarding";
import { currentIdentity } from "@/server/identity";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function CompleteProfilePage() {
  const identity = await currentIdentity();
  if (!identity) redirect("/");
  if (!identity.investor) redirect(identity.advisor ? "/advisor/status" : "/");

  const investor = identity.investor;
  const [firstName = "", ...rest] = (investor.contactName ?? "").split(" ");

  return (
    <ProfileForm
      initial={{ firstName, lastName: rest.join(" "), email: investor.contactEmail ?? "" }}
      nextHref={nextInvestorPath({ ...investor, contactName: "set", contactEmail: "set" })}
    />
  );
}
