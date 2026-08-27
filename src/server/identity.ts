import { eq } from "drizzle-orm";

import { db } from "@/db";
import { platformAdmins, users, type User } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readDevSession } from "@/server/auth/dev-session";

/**
 * Who is asking, and what are they allowed to do.
 *
 * The single chokepoint for authorisation. Roles are rows in our own tables,
 * never JWT claims, so nothing here needs a key that bypasses row-level
 * security.
 *
 * ## The registration gate is gone
 *
 * This module used to export `requirePublishingRights`, which refused every
 * protected action unless the caller held a current SEBI Research Analyst
 * registration. It guarded strategy publication, group creation, signal
 * issuance and fee collection.
 *
 * None of those exist any more. `CLAUDE.md` §2 abandons the Research Analyst
 * direction, and §8.5 makes a user's strategies private to them — so there is
 * no publication to gate, and holding a registration would not change what
 * anyone may do here. Removed rather than left permanently allowing, because a
 * gate that always opens reads like protection and is not.
 *
 * What replaces it is narrower and honest: `requireUser` answers "is this a
 * real account", and ownership is checked per row against `user_id`. A user may
 * only ever see their own work — that is the whole authorisation model, and it
 * is the one §8.5 requires.
 */

/**
 * The minimum we need about the signed-in person.
 *
 * Deliberately not Supabase's `User`: the session may come from Supabase Auth
 * or, while no SMS provider is configured, from the development bypass. Keeping
 * this shape small means nothing downstream cares which.
 */
export type AuthUser = { id: string; phone: string | null };

export type { User } from "@/db/schema";

export type Identity = {
  auth: AuthUser;
  /** Null until the account finishes its first onboarding step. */
  user: User | null;
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

/** The signed-in account plus its profile row, if onboarding has created one. */
export async function currentIdentity(): Promise<Identity | null> {
  const auth = await currentUser();
  if (!auth) return null;

  const database = db();
  const [userRow, adminRow] = await Promise.all([
    database.select().from(users).where(eq(users.authUserId, auth.id)).limit(1),
    database.select().from(platformAdmins).where(eq(platformAdmins.userId, auth.id)).limit(1),
  ]);

  return {
    auth,
    user: userRow[0] ?? null,
    isAdmin: adminRow.length > 0,
  };
}

export async function requireIdentity(): Promise<Identity> {
  const identity = await currentIdentity();
  if (!identity) throw new NotAuthenticatedError();
  return identity;
}

/**
 * A signed-in account that has a profile row.
 *
 * Everything that owns data — strategies, backtests, forward tests, holdings —
 * needs a `users.id` to hang it off, so this is the guard those actions call.
 */
export async function requireUser(): Promise<{ identity: Identity; user: User }> {
  const identity = await requireIdentity();
  if (!identity.user) throw new NotAuthorisedError("Finish setting up your account first");
  return { identity, user: identity.user };
}

export async function requireAdmin(): Promise<Identity> {
  const identity = await requireIdentity();
  if (!identity.isAdmin) throw new NotAuthorisedError("Platform ops access required");
  return identity;
}
