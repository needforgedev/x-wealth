import { describe, expect, it } from "vitest";

import { registrationGate, type GateSubject } from "./registration-gate";

/**
 * The registration gate is the thing standing between us and an unregistered
 * intermediary publishing recommendations, so it is tested as a pure function
 * with every status and both edges of expiry.
 */

const NOW = new Date("2026-08-19T00:00:00Z");

function advisor(overrides: Partial<GateSubject> = {}): GateSubject {
  return {
    registrationValidUntil: new Date("2027-01-01T00:00:00Z"),
    verificationStatus: "VERIFIED",
    ...overrides,
  };
}

describe("registrationGate", () => {
  it("allows a verified advisor with a live registration", () => {
    expect(registrationGate(advisor(), NOW)).toEqual({ allowed: true });
  });

  it("blocks every non-verified status", () => {
    const cases = [
      ["UNSUBMITTED", "NOT_SUBMITTED"],
      ["PENDING", "PENDING_REVIEW"],
      ["REJECTED", "REJECTED"],
      ["SUSPENDED", "SUSPENDED"],
    ] as const;

    for (const [status, reason] of cases) {
      expect(
        registrationGate(advisor({ verificationStatus: status }), NOW),
        status,
      ).toEqual({ allowed: false, reason });
    }
  });

  it("blocks a non-advisor", () => {
    expect(registrationGate(null, NOW)).toEqual({ allowed: false, reason: "NOT_AN_ADVISOR" });
  });

  it("fails closed when no expiry is on file", () => {
    // An unknown expiry cannot be asserted to be in the future. Treating null
    // as "fine" would let a verified-but-undated advisor publish forever.
    expect(registrationGate(advisor({ registrationValidUntil: null }), NOW)).toEqual({
      allowed: false,
      reason: "NO_EXPIRY_RECORDED",
    });
  });

  it("auto-suspends on lapse without needing a background job", () => {
    expect(
      registrationGate(advisor({ registrationValidUntil: new Date("2026-08-18T23:59:59Z") }), NOW),
    ).toEqual({ allowed: false, reason: "REGISTRATION_LAPSED" });
  });

  it("treats the exact expiry instant as lapsed", () => {
    expect(registrationGate(advisor({ registrationValidUntil: NOW }), NOW)).toEqual({
      allowed: false,
      reason: "REGISTRATION_LAPSED",
    });
  });

  it("allows one second before expiry", () => {
    expect(
      registrationGate(advisor({ registrationValidUntil: new Date(NOW.getTime() + 1000) }), NOW),
    ).toEqual({ allowed: true });
  });

  it("blocks a verified advisor whose status was later suspended, regardless of expiry", () => {
    expect(
      registrationGate(
        advisor({
          verificationStatus: "SUSPENDED",
          registrationValidUntil: new Date("2030-01-01T00:00:00Z"),
        }),
        NOW,
      ),
    ).toEqual({ allowed: false, reason: "SUSPENDED" });
  });
});
