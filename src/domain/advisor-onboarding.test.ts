import { describe, expect, it } from "vitest";

import {
  canOpenStep,
  nextAdvisorPath,
  nextAdvisorStep,
  type OnboardingSubject,
} from "./advisor-onboarding";

const subject = (o: Partial<OnboardingSubject> = {}): OnboardingSubject => ({
  contactName: "Nabeel Shaikh",
  contactEmail: "nabeel@firm.in",
  verificationStatus: "VERIFIED",
  ...o,
});

describe("nextAdvisorStep", () => {
  it("sends a brand-new advisor to the profile step", () => {
    expect(nextAdvisorStep(subject({ contactName: null, contactEmail: null, verificationStatus: "UNSUBMITTED" }))).toBe("PROFILE");
  });

  it("treats a blank name as missing", () => {
    expect(nextAdvisorStep(subject({ contactName: "   ", verificationStatus: "UNSUBMITTED" }))).toBe("PROFILE");
  });

  it("sends a profiled but unsubmitted advisor to KYC", () => {
    expect(nextAdvisorStep(subject({ verificationStatus: "UNSUBMITTED" }))).toBe("KYC");
  });

  it("sends a rejected advisor back to KYC to correct and resubmit", () => {
    expect(nextAdvisorStep(subject({ verificationStatus: "REJECTED" }))).toBe("KYC");
  });

  it("does not re-ask a verified advisor for anything", () => {
    // The bug this function exists to fix: signing in as a verified advisor
    // used to drop you back at the first onboarding screen.
    expect(nextAdvisorStep(subject({ verificationStatus: "VERIFIED" }))).toBe("STATUS");
    expect(nextAdvisorPath(subject({ verificationStatus: "VERIFIED" }))).toBe("/advisor/status");
  });

  it("holds a pending advisor on status rather than letting them resubmit", () => {
    expect(nextAdvisorStep(subject({ verificationStatus: "PENDING" }))).toBe("STATUS");
  });

  it("keeps a suspended advisor on status", () => {
    expect(nextAdvisorStep(subject({ verificationStatus: "SUSPENDED" }))).toBe("STATUS");
  });
});

describe("canOpenStep", () => {
  it("lets anyone edit their own profile", () => {
    expect(canOpenStep(subject({ verificationStatus: "VERIFIED" }), "PROFILE")).toBe(true);
  });

  it("blocks KYC while a submission is under review", () => {
    expect(canOpenStep(subject({ verificationStatus: "PENDING" }), "KYC")).toBe(false);
  });

  it("blocks KYC once verified", () => {
    expect(canOpenStep(subject({ verificationStatus: "VERIFIED" }), "KYC")).toBe(false);
  });

  it("allows KYC when unsubmitted or rejected", () => {
    expect(canOpenStep(subject({ verificationStatus: "UNSUBMITTED" }), "KYC")).toBe(true);
    expect(canOpenStep(subject({ verificationStatus: "REJECTED" }), "KYC")).toBe(true);
  });

  it("hides status from someone who has not filled a profile", () => {
    expect(canOpenStep(subject({ contactName: null, verificationStatus: "UNSUBMITTED" }), "STATUS")).toBe(false);
  });
});
