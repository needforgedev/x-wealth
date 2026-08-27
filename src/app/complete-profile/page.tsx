import { redirect } from "next/navigation";

import { nextPath } from "@/domain/onboarding";
import { currentIdentity } from "@/server/identity";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function CompleteProfilePage() {
  const identity = await currentIdentity();
  if (!identity) redirect("/");
  if (!identity.user) redirect(identity.user ? "/advisor/status" : "/");

  const user = identity.user;
  const [firstName = "", ...rest] = (user.contactName ?? "").split(" ");

  return (
    <ProfileForm
      initial={{ firstName, lastName: rest.join(" "), email: user.contactEmail ?? "" }}
      nextHref={nextPath({ ...user, contactName: "set", contactEmail: "set" })}
    />
  );
}
