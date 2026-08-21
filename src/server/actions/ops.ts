"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { advisors, auditLog } from "@/db/schema";
import { NotAuthorisedError, requireAdmin } from "@/server/identity";
import type { ActionResult } from "@/server/actions/auth";

/**
 * Platform ops — registration review.
 *
 * Manual by design (W2-03). At low volume it is the correct call and it teaches
 * us the edge cases before we try to encode them. Every decision is written to
 * the audit log, because "who verified this advisor, and when" is the first
 * question anyone will ask if a verified advisor turns out not to be.
 */

export type PendingAdvisor = {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  firmName: string | null;
  sebiRegistrationNo: string | null;
  raasbEnlistmentNo: string | null;
  mcaNo: string | null;
  /** What the advisor declared at KYC. Ops confirms or corrects it on approval. */
  registrationValidUntil: Date | null;
  submittedAt: Date | null;
};

export async function listForReview(): Promise<
  ActionResult<{ pending: PendingAdvisor[]; decided: PendingAdvisor[] }>
> {
  try {
    await requireAdmin();
    const rows = await db()
      .select({
        id: advisors.id,
        contactName: advisors.contactName,
        contactEmail: advisors.contactEmail,
        firmName: advisors.firmName,
        sebiRegistrationNo: advisors.sebiRegistrationNo,
        raasbEnlistmentNo: advisors.raasbEnlistmentNo,
        mcaNo: advisors.mcaNo,
        registrationValidUntil: advisors.registrationValidUntil,
        submittedAt: advisors.updatedAt,
        status: advisors.verificationStatus,
      })
      .from(advisors)
      .orderBy(desc(advisors.updatedAt));

    return {
      ok: true,
      data: {
        pending: rows.filter((r) => r.status === "PENDING"),
        decided: rows.filter((r) => r.status === "VERIFIED" || r.status === "REJECTED"),
      },
    };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/**
 * Approve, with an explicit registration expiry.
 *
 * The expiry is required, not optional: the gate fails closed on a missing one,
 * so approving without a date would verify an advisor who still cannot publish
 * — a confusing state we simply do not allow to exist.
 */
export async function approveAdvisor(input: {
  advisorId: string;
  registrationValidUntil: string;
}): Promise<ActionResult> {
  const validUntil = new Date(`${input.registrationValidUntil}T00:00:00Z`);
  if (Number.isNaN(validUntil.getTime())) {
    return { ok: false, error: "Enter the registration expiry date." };
  }
  if (validUntil.getTime() <= Date.now()) {
    return { ok: false, error: "That expiry is in the past — the advisor could not publish." };
  }

  try {
    const admin = await requireAdmin();

    await db().transaction(async (tx) => {
      const [before] = await tx.select().from(advisors).where(eq(advisors.id, input.advisorId));
      if (!before) throw new NotAuthorisedError("No such advisor.");
      if (before.verificationStatus !== "PENDING") {
        throw new NotAuthorisedError("That advisor is not awaiting review.");
      }

      await tx
        .update(advisors)
        .set({
          verificationStatus: "VERIFIED",
          verifiedAt: new Date(),
          verifiedByUserId: admin.user.id,
          registrationValidUntil: validUntil,
          updatedAt: new Date(),
        })
        .where(eq(advisors.id, input.advisorId));

      await tx.insert(auditLog).values({
        actorUserId: admin.user.id,
        action: "advisor.verified",
        entityTable: "advisors",
        entityId: input.advisorId,
        // Status and registration number only — never the PII on the record.
        before: { verificationStatus: before.verificationStatus },
        after: {
          verificationStatus: "VERIFIED",
          sebiRegistrationNo: before.sebiRegistrationNo,
          registrationValidUntil: validUntil.toISOString(),
        },
      });
    });
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  revalidatePath("/ops");
  revalidatePath("/advisor/status");
  return { ok: true, data: undefined };
}

export async function rejectAdvisor(input: {
  advisorId: string;
  reason: string;
}): Promise<ActionResult> {
  const reason = input.reason.trim();
  if (reason.length < 5) return { ok: false, error: "Give a reason — the advisor will see it." };

  try {
    const admin = await requireAdmin();

    await db().transaction(async (tx) => {
      const [before] = await tx.select().from(advisors).where(eq(advisors.id, input.advisorId));
      if (!before) throw new NotAuthorisedError("No such advisor.");
      if (before.verificationStatus !== "PENDING") {
        throw new NotAuthorisedError("That advisor is not awaiting review.");
      }

      await tx
        .update(advisors)
        .set({
          verificationStatus: "REJECTED",
          rejectionReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(advisors.id, input.advisorId));

      await tx.insert(auditLog).values({
        actorUserId: admin.user.id,
        action: "advisor.rejected",
        entityTable: "advisors",
        entityId: input.advisorId,
        before: { verificationStatus: before.verificationStatus },
        after: { verificationStatus: "REJECTED", reason },
      });
    });
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  revalidatePath("/ops");
  revalidatePath("/advisor/status");
  return { ok: true, data: undefined };
}

function messageFor(error: unknown): string {
  if (error instanceof NotAuthorisedError) return error.message;
  console.error("[ops] action failed", error);
  return "Something went wrong. Try again.";
}
