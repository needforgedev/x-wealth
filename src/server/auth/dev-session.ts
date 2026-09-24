import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { supabasePhone } from "@/domain/phone";

/**
 * Development sign-in bypass.
 *
 * Phone auth needs an SMS provider, and in India that also needs DLT
 * registration — days to weeks of lead time. Rather than leave the flow
 * untestable until then, this accepts a fixed OTP and issues a session of our
 * own.
 *
 * ## What it does and does not do
 *
 * It creates a **real** row in `auth.users`, so every foreign key, every
 * advisor record and the whole registration gate behave exactly as they will in
 * production. What it does not create is a Supabase JWT — that needs either a
 * working provider or the Admin API, and we hold neither. So the session is a
 * signed cookie this module owns, and `currentUser()` falls back to it.
 *
 * ## When it is on
 *
 * Three conditions must all hold:
 *
 *   1. `DEV_AUTH_BYPASS=true`
 *   2. `DEV_AUTH_SECRET` set
 *   3. `NODE_ENV !== "production"` — **or** `DEV_AUTH_ALLOW_IN_PRODUCTION=true`
 *
 * The third condition used to be `NODE_ENV` alone, which made the bypass
 * unreachable in any deployed build. That is still the default. The override
 * exists because the deployed Supabase project has no SMS provider either, so
 * without it the deploy is a dead end — `sendOtp` fails, no session is ever
 * issued, and the landing page is the only reachable screen.
 *
 * ## The override is a real hole, not a mitigated one
 *
 * With it set, anyone who finds the URL signs in as any phone number using a
 * four-digit code. The HMAC signature defends the session cookie against
 * forgery; it does nothing about the front door, because the front door is
 * deliberately open.
 *
 * Acceptable only on a throwaway demo deployment with no real data behind it.
 * Never set `DEV_AUTH_ALLOW_IN_PRODUCTION` on anything a real user touches.
 *
 * **Delete this file once SMS is configured** — it is scaffolding, not
 * architecture.
 */

const COOKIE = "xw_dev_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

export function isDevAuthEnabled(): boolean {
  const allowedHere =
    process.env.NODE_ENV !== "production" ||
    process.env.DEV_AUTH_ALLOW_IN_PRODUCTION === "true";

  return (
    allowedHere && process.env.DEV_AUTH_BYPASS === "true" && Boolean(process.env.DEV_AUTH_SECRET)
  );
}

export function devOtpCode(): string {
  return process.env.DEV_OTP_CODE ?? "1111";
}

function sign(payload: string): string {
  return createHmac("sha256", process.env.DEV_AUTH_SECRET as string)
    .update(payload)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createDevSession(userId: string): Promise<void> {
  const issuedAt = Date.now();
  const payload = `${userId}.${issuedAt}`;
  const store = await cookies();
  store.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readDevSession(): Promise<string | null> {
  if (!isDevAuthEnabled()) return null;

  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, issuedAt, signature] = parts;

  if (!safeEqual(signature, sign(`${userId}.${issuedAt}`))) return null;
  if (Date.now() - Number(issuedAt) > MAX_AGE_SECONDS * 1000) return null;

  return userId;
}

export async function clearDevSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/**
 * Find or create the `auth.users` row for a phone number.
 *
 * Written directly because Supabase Auth will not mint a user without a working
 * provider. The columns set here are the ones Supabase itself populates for a
 * phone signup; everything else is nullable or defaulted.
 */
export async function findOrCreateUserByPhone(phone: string): Promise<string> {
  const database = db();
  const stored = supabasePhone(phone);

  const existing = await database.execute<{ id: string }>(
    sql`select id from auth.users where phone = ${stored} limit 1`,
  );
  if (existing.length > 0) return existing[0].id;

  const id = randomUUID();
  await database.execute(sql`
    insert into auth.users (
      id, instance_id, aud, role, phone, phone_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) values (
      ${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${stored}, now(), now(), now(),
      ${JSON.stringify({ provider: "phone", providers: ["phone"] })}::jsonb,
      '{}'::jsonb
    )
  `);
  return id;
}
