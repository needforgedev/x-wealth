/**
 * Where an account belongs right now.
 *
 * Sign-in and sign-up are one screen, so "always the first step" is wrong for
 * everyone who has already done it. The destination is computed from the record
 * instead — the bug this replaced sent a fully set-up account back through
 * every question on each sign-in.
 *
 * ## Two changes from the investor flow this replaces
 *
 * **INTERESTS is gone.** It collected which market segments a person wanted to
 * see, and it fed a discovery feed of other people's strategies. That feed was
 * the distribution surface `CLAUDE.md` §8.5 prohibits, and it is gone — so the
 * question has nothing left to answer.
 *
 * **RISK stays last, and stays the gate.** It was the last thing before an
 * investor could see signals. It is now the last thing before someone can
 * author a strategy, which matters for a different reason but just as much:
 * they are about to build something they may eventually run with real money in
 * their own broker account. Three points acknowledged separately, not one
 * blanket agreement.
 */

export type OnboardingSubject = {
  contactName: string | null;
  contactEmail: string | null;
  experienceLevel: "BEGINNER" | "INTERMEDIATE" | "EXPERT" | "SUPER_PRO" | null;
  riskAckAt: Date | null;
};

export type OnboardingStep = "PROFILE" | "EXPERIENCE" | "RISK" | "HOME";

export const STEP_PATHS: Record<OnboardingStep, string> = {
  PROFILE: "/complete-profile",
  EXPERIENCE: "/onboarding-questions",
  RISK: "/risk-disclosure",
  HOME: "/home",
};

const ORDER: readonly OnboardingStep[] = ["PROFILE", "EXPERIENCE", "RISK", "HOME"];

export function nextStep(subject: OnboardingSubject): OnboardingStep {
  if (!subject.contactName?.trim() || !subject.contactEmail?.trim()) return "PROFILE";
  if (!subject.experienceLevel) return "EXPERIENCE";
  if (!subject.riskAckAt) return "RISK";
  return "HOME";
}

export function nextPath(subject: OnboardingSubject): string {
  return STEP_PATHS[nextStep(subject)];
}

/**
 * May this account open a given step directly?
 *
 * Earlier steps stay open so anyone can go back and change an answer. Later
 * ones do not — and `HOME` is closed until risk has been acknowledged, which is
 * the whole point of putting that gate last. Deep-linking past it redirects
 * back.
 */
export function canOpenStep(subject: OnboardingSubject, step: OnboardingStep): boolean {
  return ORDER.indexOf(step) <= ORDER.indexOf(nextStep(subject));
}

/** True once the account may use the product at all. */
export function hasAcknowledgedRisk(subject: OnboardingSubject): boolean {
  return subject.riskAckAt !== null;
}
