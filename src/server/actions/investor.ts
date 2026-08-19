"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { investors } from "@/db/schema";
import { NotAuthorisedError, requireInvestor } from "@/server/identity";
import type { ActionResult } from "@/server/actions/auth";

/**
 * Investor onboarding.
 *
 * Nothing here unlocks anything except the next step. The one that matters is
 * `acknowledgeRisk` — PRD §5.9 makes it mandatory, and `nextInvestorStep`
 * refuses to let anyone past it, so an investor cannot reach a screen of
 * trading signals without having been shown what they are and are not.
 */

const EXPERIENCE_LEVELS = ["BEGINNER", "INTERMEDIATE", "EXPERT", "SUPER_PRO"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export async function saveInvestorProfile(input: {
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
    const investor = await requireInvestor();
    await db()
      .update(investors)
      .set({ contactName: fullName, contactEmail: email, updatedAt: new Date() })
      .where(eq(investors.id, investor.id));
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  revalidatePath("/investor/home");
  return { ok: true, data: undefined };
}

export async function saveExperienceLevel(level: string): Promise<ActionResult> {
  if (!EXPERIENCE_LEVELS.includes(level as ExperienceLevel)) {
    return { ok: false, error: "Choose how much experience you have." };
  }

  try {
    const investor = await requireInvestor();
    await db()
      .update(investors)
      .set({ experienceLevel: level as ExperienceLevel, updatedAt: new Date() })
      .where(eq(investors.id, investor.id));
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  return { ok: true, data: undefined };
}

export async function saveInterests(interests: string[]): Promise<ActionResult> {
  const cleaned = [...new Set(interests.map((i) => i.trim()).filter(Boolean))];
  if (cleaned.length === 0) return { ok: false, error: "Pick at least one interest." };
  if (cleaned.length > 20) return { ok: false, error: "That is too many to be useful." };

  try {
    const investor = await requireInvestor();
    await db()
      .update(investors)
      .set({ interests: cleaned, updatedAt: new Date() })
      .where(eq(investors.id, investor.id));
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  return { ok: true, data: undefined };
}

/**
 * The mandatory risk acknowledgement (PRD §5.9).
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
    const investor = await requireInvestor();
    const now = new Date();
    await db()
      .update(investors)
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
      .where(eq(investors.id, investor.id));
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  revalidatePath("/investor/home");
  return { ok: true, data: undefined };
}

function messageFor(error: unknown): string {
  if (error instanceof NotAuthorisedError) return error.message;
  console.error("[investor] action failed", error);
  return "Something went wrong. Try again.";
}
