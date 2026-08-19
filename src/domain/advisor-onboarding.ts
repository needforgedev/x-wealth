/**
 * Where an advisor belongs right now.
 *
 * Sign-in and sign-up are the same screen, so after verification we have to
 * decide where to send someone — and "always the first step of onboarding" is
 * wrong for everyone who has already done it. A verified advisor signing in
 * should land on their status, not be asked to re-enter their name.
 *
 * Pure, so the decision is testable and so the page guards and the post-login
 * redirect cannot disagree about it.
 */

export type OnboardingSubject = {
  contactName: string | null;
  contactEmail: string | null;
  verificationStatus: "UNSUBMITTED" | "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";
};

export type AdvisorStep = "PROFILE" | "KYC" | "STATUS";

export const ADVISOR_STEP_PATHS: Record<AdvisorStep, string> = {
  PROFILE: "/advisor/complete-profile",
  KYC: "/advisor/kyc",
  STATUS: "/advisor/status",
};

export function nextAdvisorStep(advisor: OnboardingSubject): AdvisorStep {
  if (!advisor.contactName?.trim() || !advisor.contactEmail?.trim()) return "PROFILE";

  // REJECTED comes back to KYC so the advisor can correct and resubmit.
  // PENDING must not — resubmitting mid-review would reset someone else's work.
  if (advisor.verificationStatus === "UNSUBMITTED" || advisor.verificationStatus === "REJECTED") {
    return "KYC";
  }

  return "STATUS";
}

export function nextAdvisorPath(advisor: OnboardingSubject): string {
  return ADVISOR_STEP_PATHS[nextAdvisorStep(advisor)];
}

/**
 * May this advisor open a given step directly?
 *
 * Guards the pages themselves, so deep-linking to `/advisor/kyc` mid-review
 * bounces rather than presenting a form whose submission would be refused.
 */
export function canOpenStep(advisor: OnboardingSubject, step: AdvisorStep): boolean {
  const next = nextAdvisorStep(advisor);
  if (step === next) return true;

  // Going back to edit your own profile is always reasonable.
  if (step === "PROFILE") return true;

  // Status is a read-only view; anyone past the profile step can see it.
  if (step === "STATUS") return next !== "PROFILE";

  return false;
}
