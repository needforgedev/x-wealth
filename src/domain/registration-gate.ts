/**
 * The registration gate.
 *
 * `x-wealth-product.md` §5.4: no strategy publication, no group creation, no
 * signal issuance and no fee collection without a verified, currently-valid
 * SEBI registration — and a lapse auto-suspends.
 *
 * Kept here, as a pure function over a plain shape, rather than inside the
 * server module that reads the database. It is the most compliance-critical
 * decision in the product and it should be testable without a session, a
 * connection, or an environment.
 */

export type GateSubject = {
  verificationStatus: "UNSUBMITTED" | "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";
  registrationValidUntil: Date | null;
};

export type GateFailure =
  | "NOT_AN_ADVISOR"
  | "NOT_SUBMITTED"
  | "PENDING_REVIEW"
  | "REJECTED"
  | "SUSPENDED"
  | "NO_EXPIRY_RECORDED"
  | "REGISTRATION_LAPSED";

export type GateResult = { allowed: true } | { allowed: false; reason: GateFailure };

/**
 * Fails closed. A missing `registrationValidUntil` is a failure, not a pass —
 * an unknown expiry cannot be asserted to be in the future, and this check is
 * what stands between us and an unregistered intermediary publishing
 * recommendations.
 */
export function registrationGate(advisor: GateSubject | null, now: Date = new Date()): GateResult {
  if (!advisor) return { allowed: false, reason: "NOT_AN_ADVISOR" };

  switch (advisor.verificationStatus) {
    case "UNSUBMITTED":
      return { allowed: false, reason: "NOT_SUBMITTED" };
    case "PENDING":
      return { allowed: false, reason: "PENDING_REVIEW" };
    case "REJECTED":
      return { allowed: false, reason: "REJECTED" };
    case "SUSPENDED":
      return { allowed: false, reason: "SUSPENDED" };
    case "VERIFIED":
      break;
  }

  if (!advisor.registrationValidUntil) {
    return { allowed: false, reason: "NO_EXPIRY_RECORDED" };
  }
  if (advisor.registrationValidUntil.getTime() <= now.getTime()) {
    return { allowed: false, reason: "REGISTRATION_LAPSED" };
  }

  return { allowed: true };
}

export const GATE_MESSAGES: Record<GateFailure, string> = {
  NOT_AN_ADVISOR: "This account is not registered as an advisor.",
  NOT_SUBMITTED: "Submit your SEBI registration before publishing anything.",
  PENDING_REVIEW: "Your registration is under review. Publishing unlocks once it is verified.",
  REJECTED: "Your registration was rejected. Correct the details and resubmit.",
  SUSPENDED: "Your publishing access is suspended.",
  NO_EXPIRY_RECORDED: "No registration expiry is on file, so publishing stays locked.",
  REGISTRATION_LAPSED:
    "Your SEBI registration has lapsed. Publishing is suspended until it is renewed.",
};
