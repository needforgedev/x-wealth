"use client";

import { CompleteProfileScreenBody } from "@/components/screens/CompleteProfileScreenBody";
import { saveAdvisorProfile } from "@/server/actions/advisor";

export function ProfileForm({
  initial,
  nextHref,
}: {
  initial: { firstName: string; lastName: string; email: string };
  nextHref: string;
}) {
  return (
    <CompleteProfileScreenBody
      backHref="/advisor/otp"
      nextHref={nextHref}
      initial={initial}
      placeholders={{
        firstName: "First name",
        lastName: "Last name",
        email: "you@firm.com",
        dob: "19-08-1998",
        gender: "Male",
      }}
      onSubmit={async ({ firstName, lastName, email }) => {
        const result = await saveAdvisorProfile({
          fullName: `${firstName} ${lastName}`.trim(),
          email,
        });
        return result.ok ? null : result.error;
      }}
    />
  );
}
