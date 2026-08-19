import { describe, expect, it } from "vitest";

import {
  canOpenInvestorStep,
  hasAcknowledgedRisk,
  nextInvestorPath,
  nextInvestorStep,
  type InvestorOnboardingSubject,
} from "./investor-onboarding";

const complete = (o: Partial<InvestorOnboardingSubject> = {}): InvestorOnboardingSubject => ({
  contactName: "Anita Desai",
  contactEmail: "anita@example.in",
  experienceLevel: "INTERMEDIATE",
  interests: ["Bank NIFTY"],
  riskAckAt: new Date("2026-08-19T00:00:00Z"),
  ...o,
});

describe("nextInvestorStep", () => {
  it("walks the steps in order", () => {
    expect(nextInvestorStep(complete({ contactName: null }))).toBe("PROFILE");
    expect(nextInvestorStep(complete({ experienceLevel: null }))).toBe("EXPERIENCE");
    expect(nextInvestorStep(complete({ interests: [] }))).toBe("INTERESTS");
    expect(nextInvestorStep(complete({ riskAckAt: null }))).toBe("RISK");
    expect(nextInvestorStep(complete())).toBe("HOME");
  });

  it("treats a blank name and a null interests list as missing", () => {
    expect(nextInvestorStep(complete({ contactName: "  " }))).toBe("PROFILE");
    expect(nextInvestorStep(complete({ interests: null }))).toBe("INTERESTS");
  });

  it("does not re-ask a fully onboarded investor for anything", () => {
    expect(nextInvestorPath(complete())).toBe("/investor/home");
  });
});

describe("risk acknowledgement is the last gate", () => {
  it("keeps an un-acknowledged investor out of the app", () => {
    // PRD §5.9 — nobody sees trading signals before accepting what they are.
    const investor = complete({ riskAckAt: null });
    expect(canOpenInvestorStep(investor, "HOME")).toBe(false);
    expect(hasAcknowledgedRisk(investor)).toBe(false);
  });

  it("opens the app once acknowledged", () => {
    expect(canOpenInvestorStep(complete(), "HOME")).toBe(true);
    expect(hasAcknowledgedRisk(complete())).toBe(true);
  });
});

describe("canOpenInvestorStep", () => {
  it("lets an investor go back and change an earlier answer", () => {
    const investor = complete();
    expect(canOpenInvestorStep(investor, "PROFILE")).toBe(true);
    expect(canOpenInvestorStep(investor, "EXPERIENCE")).toBe(true);
    expect(canOpenInvestorStep(investor, "INTERESTS")).toBe(true);
  });

  it("blocks skipping ahead", () => {
    const fresh = complete({ contactName: null, experienceLevel: null, interests: [], riskAckAt: null });
    expect(canOpenInvestorStep(fresh, "PROFILE")).toBe(true);
    expect(canOpenInvestorStep(fresh, "INTERESTS")).toBe(false);
    expect(canOpenInvestorStep(fresh, "RISK")).toBe(false);
    expect(canOpenInvestorStep(fresh, "HOME")).toBe(false);
  });
});
