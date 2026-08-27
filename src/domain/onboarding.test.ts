import { describe, expect, it } from "vitest";

import {
  canOpenStep,
  hasAcknowledgedRisk,
  nextPath,
  nextStep,
  STEP_PATHS,
  type OnboardingSubject,
} from "./onboarding";

const complete = (o: Partial<OnboardingSubject> = {}): OnboardingSubject => ({
  contactName: "Anita Desai",
  contactEmail: "anita@example.in",
  experienceLevel: "INTERMEDIATE",
  riskAckAt: new Date("2026-08-19T00:00:00Z"),
  ...o,
});

describe("nextStep", () => {
  it("walks the steps in order", () => {
    expect(nextStep(complete({ contactName: null }))).toBe("PROFILE");
    expect(nextStep(complete({ experienceLevel: null }))).toBe("EXPERIENCE");
    expect(nextStep(complete({ riskAckAt: null }))).toBe("RISK");
    expect(nextStep(complete())).toBe("HOME");
  });

  it("treats a blank name as missing, not as an answer", () => {
    expect(nextStep(complete({ contactName: "  " }))).toBe("PROFILE");
    expect(nextStep(complete({ contactEmail: "" }))).toBe("PROFILE");
  });

  it("does not re-ask a fully onboarded account for anything", () => {
    expect(nextPath(complete())).toBe("/home");
  });
});

describe("risk acknowledgement is the last gate", () => {
  it("keeps an un-acknowledged account out of the app", () => {
    // Last thing before someone authors a strategy they may eventually run
    // with real money in their own broker account.
    const subject = complete({ riskAckAt: null });
    expect(canOpenStep(subject, "HOME")).toBe(false);
    expect(hasAcknowledgedRisk(subject)).toBe(false);
  });

  it("opens the app once acknowledged", () => {
    expect(canOpenStep(complete(), "HOME")).toBe(true);
    expect(hasAcknowledgedRisk(complete())).toBe(true);
  });

  it("stays shut even when every earlier answer is present", () => {
    // The gate is the acknowledgement itself, not completeness of the profile.
    expect(canOpenStep(complete({ riskAckAt: null }), "HOME")).toBe(false);
  });
});

describe("canOpenStep", () => {
  it("lets an account go back and change an earlier answer", () => {
    const subject = complete();
    expect(canOpenStep(subject, "PROFILE")).toBe(true);
    expect(canOpenStep(subject, "EXPERIENCE")).toBe(true);
    expect(canOpenStep(subject, "RISK")).toBe(true);
  });

  it("refuses a step the account has not reached yet", () => {
    const fresh = complete({ contactName: null, experienceLevel: null, riskAckAt: null });
    expect(canOpenStep(fresh, "PROFILE")).toBe(true);
    expect(canOpenStep(fresh, "EXPERIENCE")).toBe(false);
    expect(canOpenStep(fresh, "RISK")).toBe(false);
    expect(canOpenStep(fresh, "HOME")).toBe(false);
  });

  it("has no INTERESTS step — the discovery feed it fed is prohibited", () => {
    // CLAUDE.md §8.5. Asserted rather than assumed so that restoring the
    // question means deleting this test, which is a decision someone makes
    // rather than a line that quietly stops being true.
    expect(Object.keys(STEP_PATHS)).toEqual(["PROFILE", "EXPERIENCE", "RISK", "HOME"]);
    expect(Object.values(STEP_PATHS)).not.toContain("/choose-interests");
  });
});
