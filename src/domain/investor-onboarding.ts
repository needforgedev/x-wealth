/**
 * Where an investor belongs right now.
 *
 * Same problem the advisor side had: sign-in and sign-up are one screen, so
 * "always the first step" is wrong for everyone who has already done it.
 *
 * The ordering matters beyond convenience. **Risk acknowledgement is the last
 * gate before the app** (PRD §5.9) — an investor must not reach a screen full
 * of trading signals before they have been shown, and accepted, what those
 * signals are and are not.
 */

export type InvestorOnboardingSubject = {
  contactName: string | null;
  contactEmail: string | null;
  experienceLevel: "BEGINNER" | "INTERMEDIATE" | "EXPERT" | "SUPER_PRO" | null;
  interests: string[] | null;
  riskAckAt: Date | null;
};

export type InvestorStep = "PROFILE" | "EXPERIENCE" | "INTERESTS" | "RISK" | "HOME";

export const INVESTOR_STEP_PATHS: Record<InvestorStep, string> = {
  PROFILE: "/complete-profile",
  EXPERIENCE: "/onboarding-questions",
  INTERESTS: "/choose-interests",
  RISK: "/risk-disclosure",
  HOME: "/investor/home",
};

export function nextInvestorStep(investor: InvestorOnboardingSubject): InvestorStep {
  if (!investor.contactName?.trim() || !investor.contactEmail?.trim()) return "PROFILE";
  if (!investor.experienceLevel) return "EXPERIENCE";
  if (!investor.interests || investor.interests.length === 0) return "INTERESTS";
  if (!investor.riskAckAt) return "RISK";
  return "HOME";
}

export function nextInvestorPath(investor: InvestorOnboardingSubject): string {
  return INVESTOR_STEP_PATHS[nextInvestorStep(investor)];
}

/**
 * May this investor open a given step directly?
 *
 * Earlier steps stay open so anyone can go back and change an answer. Later
 * ones do not — and `HOME` is closed until risk has been acknowledged, which is
 * the whole point of putting that gate last.
 */
export function canOpenInvestorStep(
  investor: InvestorOnboardingSubject,
  step: InvestorStep,
): boolean {
  const order: InvestorStep[] = ["PROFILE", "EXPERIENCE", "INTERESTS", "RISK", "HOME"];
  const next = nextInvestorStep(investor);
  return order.indexOf(step) <= order.indexOf(next);
}

/** True once the investor may see signals at all. */
export function hasAcknowledgedRisk(investor: InvestorOnboardingSubject): boolean {
  return investor.riskAckAt !== null;
}
