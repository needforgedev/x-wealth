"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { NotAuthorisedError, requireUser } from "@/server/identity";
import type { ActionResult } from "@/server/actions/auth";

/**
 * Account onboarding.
 *
 * Nothing here unlocks anything except the next step. The one that matters is
 * `acknowledgeRisk`: `nextStep` refuses to let anyone past it, so nobody
 * reaches the strategy builder without having been shown, and accepted, what
 * this product is and is not.
 *
 * `saveInterests` used to live here. It collected market segments to
 * personalise a discovery feed of other people's strategies — the surface
 * `CLAUDE.md` §8.5 prohibits — so both the step and the column are gone.
 */

const EXPERIENCE_LEVELS = ["BEGINNER", "INTERMEDIATE", "EXPERT", "SUPER_PRO"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export async function saveProfile(input: {
  fullName: string;
  email: string;
}): Promise<ActionResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim();

  if (fullName.length < 2) return { ok: false, error: "Enter your full name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  try {
    const { user } = await requireUser();
    await db()
      .update(users)
      .set({ contactName: fullName, contactEmail: email, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  revalidatePath("/home");
  return { ok: true, data: undefined };
}

export async function saveExperienceLevel(level: string): Promise<ActionResult> {
  if (!EXPERIENCE_LEVELS.includes(level as ExperienceLevel)) {
    return { ok: false, error: "Choose how much experience you have." };
  }

  try {
    const { user } = await requireUser();
    await db()
      .update(users)
      .set({ experienceLevel: level as ExperienceLevel, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  return { ok: true, data: undefined };
}

/**
 * The mandatory risk acknowledgement.
 *
 * Recorded with a timestamp rather than a boolean: "when did this person accept
 * these terms" is the question that actually gets asked later, and a bare true
 * cannot answer it. `suitability` captures what they told us about themselves
 * at the same moment, so the record is contemporaneous.
 */
export async function acknowledgeRisk(input: {
  understandsLoss: boolean;
  understandsNotAdvice: boolean;
  understandsPastPerformance: boolean;
}): Promise<ActionResult> {
  if (!input.understandsLoss || !input.understandsNotAdvice || !input.understandsPastPerformance) {
    return { ok: false, error: "Every point has to be acknowledged." };
  }

  try {
    const { user } = await requireUser();
    const now = new Date();
    await db()
      .update(users)
      .set({
        riskAckAt: now,
        suitability: {
          acknowledgedAt: now.toISOString(),
          understandsLoss: true,
          understandsNotAdvice: true,
          understandsPastPerformance: true,
          version: 1,
        },
        updatedAt: now,
      })
      .where(eq(users.id, user.id));
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  revalidatePath("/home");
  return { ok: true, data: undefined };
}

function messageFor(error: unknown): string {
  if (error instanceof NotAuthorisedError) return error.message;
  console.error("[profile] action failed", error);
  return "Something went wrong. Try again.";
}
