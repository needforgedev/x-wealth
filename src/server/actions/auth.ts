"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { advisors, investors } from "@/db/schema";
import { nextAdvisorPath } from "@/domain/advisor-onboarding";
import { nextInvestorPath } from "@/domain/investor-onboarding";
import { normalisePhone } from "@/domain/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  clearDevSession,
  createDevSession,
  devOtpCode,
  findOrCreateUserByPhone,
  isDevAuthEnabled,
} from "@/server/auth/dev-session";
import { currentUser } from "@/server/identity";

/**
 * Phone OTP sign-in and sign-up — the same screen does both.
 *
 * Supabase Auth owns the credential; we own everything after it. On first
 * successful verification we create the matching row in our own tables, which
 * is where roles and verification status live — not in JWT claims. See
 * `plan.md` W1-22 for why that keeps a secret key out of this codebase.
 *
 * While no SMS provider is configured, the development bypass accepts a fixed
 * code and issues its own session. Everything downstream — the advisor record,
 * the registration gate, the ops queue — is identical either way.
 */

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export type OtpChannel = "SMS" | "DEV_BYPASS";

export async function sendOtp(
  rawPhone: string,
): Promise<ActionResult<{ channel: OtpChannel; hint: string | null }>> {
  const phone = normalisePhone(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid 10-digit mobile number." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (!error) {
    return { ok: true, data: { channel: "SMS", hint: null } };
  }

  // No provider yet. In development that is expected, and the fixed code takes
  // over rather than dead-ending the flow.
  const providerMissing =
    error.code === "phone_provider_disabled" || /provider/i.test(error.message);

  if (providerMissing && isDevAuthEnabled()) {
    return {
      ok: true,
      data: { channel: "DEV_BYPASS", hint: `SMS is not configured — use ${devOtpCode()}.` },
    };
  }

  console.error("[auth] signInWithOtp failed", { code: error.code, message: error.message });
  return { ok: false, error: "Could not send the code. Try again in a moment." };
}

export type Role = "ADVISOR" | "INVESTOR";

/**
 * Verify the code and make sure the user has a profile row.
 *
 * `role` only takes effect the first time — an existing advisor signing in
 * again does not become an investor because a different tab was open.
 */
export async function verifyOtp(
  rawPhone: string,
  token: string,
  role: Role,
): Promise<ActionResult<{ role: Role; next: string }>> {
  const phone = normalisePhone(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid 10-digit mobile number." };

  const code = token.trim();
  if (!/^\d{4,8}$/.test(code)) return { ok: false, error: "Enter the code you received." };

  /**
   * The bypass keys off the code itself, not off a provider error.
   *
   * Verification never reaches the SMS provider — Supabase just looks for a
   * pending token — so an unconfigured project returns "token invalid", which
   * is indistinguishable from a genuinely wrong code. Deciding here keeps the
   * behaviour predictable: in development, this exact code always works.
   *
   * `isDevAuthEnabled()` is false in production, so this whole branch is dead
   * code there.
   */
  if (isDevAuthEnabled() && code === devOtpCode()) {
    const userId = await findOrCreateUserByPhone(phone);
    await createDevSession(userId);
    return { ok: true, data: await ensureProfile(userId, role) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });

  if (error) {
    console.error("[auth] verifyOtp failed", { code: error.code, message: error.message });
    return { ok: false, error: "That code is not right, or it has expired." };
  }

  const user = await currentUser();
  if (!user) return { ok: false, error: "Signed in, but the session did not stick. Try again." };

  return { ok: true, data: await ensureProfile(user.id, role) };
}

/**
 * Create the profile row on first sign-in, and say where the person belongs.
 *
 * The destination is computed from the record rather than hardcoded, because
 * this same screen is both sign-up and sign-in — a returning verified advisor
 * must not be dropped back at the first onboarding step.
 *
 * An advisor exists here from sign-up with `verification_status = UNSUBMITTED`
 * and no registration number — the schema permits exactly that state, and a
 * CHECK stops the record leaving it without one (migration 0002).
 */
async function ensureProfile(
  userId: string,
  requested: Role,
): Promise<{ role: Role; next: string }> {
  const database = db();

  const [existingAdvisor] = await database
    .select()
    .from(advisors)
    .where(eq(advisors.userId, userId))
    .limit(1);
  if (existingAdvisor) {
    return { role: "ADVISOR", next: nextAdvisorPath(existingAdvisor) };
  }

  const [existingInvestor] = await database
    .select()
    .from(investors)
    .where(eq(investors.userId, userId))
    .limit(1);
  if (existingInvestor) {
    return { role: "INVESTOR", next: nextInvestorPath(existingInvestor) };
  }

  if (requested === "ADVISOR") {
    const [created] = await database.insert(advisors).values({ userId }).returning();
    return { role: "ADVISOR", next: nextAdvisorPath(created) };
  }

  const [createdInvestor] = await database.insert(investors).values({ userId }).returning();
  return { role: "INVESTOR", next: nextInvestorPath(createdInvestor) };
}

export async function signOut(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  await clearDevSession();
  return { ok: true, data: undefined };
}
