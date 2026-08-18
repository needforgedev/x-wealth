import { CompleteProfileScreenBody } from "@/components/screens/CompleteProfileScreenBody";

/**
 * The "Auto-fill" artboard — the same Complete Profile form, prompting for each
 * field rather than pre-filling a sample identity, because Alpha reaches it
 * straight from a federated sign-in.
 */
export default function AlphaCompleteProfilePage() {
  return (
    <CompleteProfileScreenBody
      backHref="/alpha/otp"
      nextHref="/alpha/onboarding-questions"
      placeholders={{
        firstName: "First Name",
        lastName: "Last Name",
        email: "Enter your email address",
        dob: "DD-MM-YY",
        gender: "Select",
      }}
    />
  );
}
