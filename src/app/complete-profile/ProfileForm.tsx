"use client";

import { CompleteProfileScreenBody } from "@/components/screens/CompleteProfileScreenBody";
import { saveProfile } from "@/server/actions/profile";

export function ProfileForm({
  initial,
  nextHref,
}: {
  initial: { firstName: string; lastName: string; email: string };
  nextHref: string;
}) {
  return (
    <CompleteProfileScreenBody
      backHref="/otp"
      nextHref={nextHref}
      initial={initial}
      onSubmit={async ({ firstName, lastName, email }) => {
        const result = await saveProfile({
          fullName: `${firstName} ${lastName}`.trim(),
          email,
        });
        return result.ok ? null : result.error;
      }}
    />
  );
}
