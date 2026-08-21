"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { advisorDocuments, advisors } from "@/db/schema";
import { NotAuthorisedError, requireAdvisor } from "@/server/identity";
import type { ActionResult } from "@/server/actions/auth";

/**
 * Advisor onboarding: who you are, then your SEBI registration.
 *
 * Nothing here can unlock publishing. Submission moves the record to PENDING
 * and only an admin can move it to VERIFIED (`src/server/actions/ops.ts`) —
 * `x-wealth-product.md` §5.4, and W2-03: manual review is deliberate in v1.
 */

export async function saveAdvisorProfile(input: {
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
    const { advisor } = await requireAdvisor();
    await db()
      .update(advisors)
      .set({ contactName: fullName, contactEmail: email, updatedAt: new Date() })
      .where(eq(advisors.id, advisor.id));
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  revalidatePath("/advisor/status");
  return { ok: true, data: undefined };
}

export type KycInput = {
  sebiRegistrationNo: string;
  raasbEnlistmentNo: string;
  firmName: string;
  mcaNo: string;
  /** `YYYY-MM-DD`, read off the certificate. */
  registrationValidUntil: string;
  documentType: string;
  /** Simulated for now — W1-19 wires real uploads to a private bucket. */
  documentAttached: boolean;
};

export async function submitKyc(input: KycInput): Promise<ActionResult> {
  const sebi = input.sebiRegistrationNo.trim().toUpperCase();
  const raasb = input.raasbEnlistmentNo.trim();
  const firm = input.firmName.trim();

  // SEBI research analyst registrations are INH/INA followed by nine digits.
  if (!/^IN[HA]\d{9}$/.test(sebi)) {
    return { ok: false, error: "Registration number should look like INH000012345." };
  }
  if (raasb.length < 3) return { ok: false, error: "Enter your RAASB enlistment number." };
  if (firm.length < 2) return { ok: false, error: "Enter your firm name." };

  // Declared here rather than only at review, so ops cross-checks a date the
  // advisor has stated against the SEBI register instead of inventing one.
  const validUntil = new Date(`${input.registrationValidUntil}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.registrationValidUntil) || Number.isNaN(validUntil.getTime())) {
    return { ok: false, error: "Enter the date your registration is valid until." };
  }
  if (validUntil.getTime() <= Date.now()) {
    return { ok: false, error: "That date has already passed — enter a current registration." };
  }

  if (!input.documentAttached) {
    return { ok: false, error: "Attach your registration certificate." };
  }

  try {
    const { advisor } = await requireAdvisor();

    if (advisor.verificationStatus === "PENDING") {
      return { ok: false, error: "Your submission is already under review." };
    }
    if (advisor.verificationStatus === "VERIFIED") {
      return { ok: false, error: "You are already verified." };
    }

    await db().transaction(async (tx) => {
      await tx
        .update(advisors)
        .set({
          sebiRegistrationNo: sebi,
          raasbEnlistmentNo: raasb,
          firmName: firm,
          mcaNo: input.mcaNo.trim() || null,
          // Unlocks nothing on its own: the gate needs VERIFIED as well, and
          // only ops can set that — it confirms or corrects this date there.
          registrationValidUntil: validUntil,
          verificationStatus: "PENDING",
          updatedAt: new Date(),
        })
        .where(eq(advisors.id, advisor.id));

      await tx.insert(advisorDocuments).values({
        advisorId: advisor.id,
        docType: "SEBI_REGISTRATION_CERTIFICATE",
        // Placeholder until W1-19 puts the real object in a private bucket.
        storageRef: `pending-upload/${advisor.id}/${Date.now()}`,
      });
    });
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  revalidatePath("/advisor/status");
  revalidatePath("/ops");
  return { ok: true, data: undefined };
}

function messageFor(error: unknown): string {
  if (error instanceof NotAuthorisedError) return error.message;
  const message = error instanceof Error ? error.message : "";

  // The partial unique index on sebi_registration_no.
  if (message.includes("advisors_sebi_registration_no_key")) {
    return "That registration number is already on another account.";
  }
  console.error("[advisor] action failed", error);
  return "Something went wrong. Try again.";
}
