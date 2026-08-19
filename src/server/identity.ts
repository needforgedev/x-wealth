import { eq } from "drizzle-orm";

import { db } from "@/db";
import { advisors, investors, platformAdmins } from "@/db/schema";
import { GATE_MESSAGES, registrationGate } from "@/domain/registration-gate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readDevSession } from "@/server/auth/dev-session";

/**
 * Who is asking, and what are they allowed to do.
 *
 * This module is the single chokepoint for authorisation. `x-wealth-product.md`
 * §5.4 asks for a middleware-level registration gate rather than per-endpoint
 * checks; in Next 16 the proxy runs at a network boundary and is the wrong
 * place for a database read, so the gate lives here instead — one guard that
 * every protected action calls. Same intent, one place to audit.
 *
 * Roles are rows in our own tables, never JWT claims. Nothing here needs a key
 * that bypasses row-level security.
 */

export { GATE_MESSAGES, registrationGate } from "@/domain/registration-gate";
export type { GateFailure, GateResult } from "@/domain/registration-gate";

/**
 * The minimum we need about the signed-in person.
 *
 * Deliberately not Supabase's `User`: the session may come from Supabase Auth
 * or, while no SMS provider is configured, from the development bypass. Keeping
 * this shape small means nothing downstream cares which.
 */
export type AuthUser = { id: string; phone: string | null };

export type Advisor = typeof advisors.$inferSelect;
export type Investor = typeof investors.$inferSelect;

export type Identity = {
  user: AuthUser;
  advisor: Advisor | null;
  investor: Investor | null;
  isAdmin: boolean;
};

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not signed in");
  }
}

export class NotAuthorisedError extends Error {}

/**
 * The signed-in user, or null.
 *
 * Supabase Auth first. The development bypass is only consulted when there is
 * no real session, and it refuses to run outside development — see
 * `src/server/auth/dev-session.ts`.
 */
export async function currentUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user) {
    return { id: data.user.id, phone: data.user.phone ?? null };
  }

  const devUserId = await readDevSession();
  return devUserId ? { id: devUserId, phone: null } : null;
}

/** The signed-in user plus whatever roles they hold in our own tables. */
export async function currentIdentity(): Promise<Identity | null> {
  const user = await currentUser();
  if (!user) return null;

  const database = db();
  const [advisorRow, investorRow, adminRow] = await Promise.all([
    database.select().from(advisors).where(eq(advisors.userId, user.id)).limit(1),
    database.select().from(investors).where(eq(investors.userId, user.id)).limit(1),
    database.select().from(platformAdmins).where(eq(platformAdmins.userId, user.id)).limit(1),
  ]);

  return {
    user,
    advisor: advisorRow[0] ?? null,
    investor: investorRow[0] ?? null,
    isAdmin: adminRow.length > 0,
  };
}

export async function requireIdentity(): Promise<Identity> {
  const identity = await currentIdentity();
  if (!identity) throw new NotAuthenticatedError();
  return identity;
}

export async function requireAdvisor(): Promise<{ identity: Identity; advisor: Advisor }> {
  const identity = await requireIdentity();
  if (!identity.advisor) throw new NotAuthorisedError("This account is not an advisor");
  return { identity, advisor: identity.advisor };
}

export async function requireInvestor(): Promise<Investor> {
  const identity = await requireIdentity();
  if (!identity.investor) throw new NotAuthorisedError("This account is not an investor");
  return identity.investor;
}

export async function requireAdmin(): Promise<Identity> {
  const identity = await requireIdentity();
  if (!identity.isAdmin) throw new NotAuthorisedError("Platform ops access required");
  return identity;
}

/**
 * Guard for every action the gate covers: strategy publication, group creation,
 * signal issuance, fee collection.
 */
export async function requirePublishingRights(): Promise<{
  identity: Identity;
  advisor: Advisor;
}> {
  const { identity, advisor } = await requireAdvisor();
  const gate = registrationGate(advisor);
  if (!gate.allowed) throw new NotAuthorisedError(GATE_MESSAGES[gate.reason]);
  return { identity, advisor };
}
