"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { advisors, groupInvitations, groups, pricingTiers, subscriptions } from "@/db/schema";
import { formatPhone, normalisePhone } from "@/domain/phone";
import {
  NotAuthenticatedError,
  NotAuthorisedError,
  requireIdentity,
  requirePublishingRights,
} from "@/server/identity";
import type { ActionResult } from "@/server/actions/auth";

/**
 * Invitations into a private group.
 *
 * ## Why a phone number and not an investor id
 *
 * The people an advisor wants to invite mostly do not have accounts yet — they
 * are names on a Telegram channel, and what the advisor has is a list of
 * numbers. So an invitation is issued against a number and waits. Whoever signs
 * in with that number can take it up; the invitation binds to an investor only
 * at that moment.
 *
 * ## The two doors into a group
 *
 * A public group is entered with `joinGroup`. A private one is entered by
 * accepting an invitation, and by nothing else. Keeping them separate means
 * neither has to reason about the other's case, and `joinGroup` can stay a flat
 * "is this public?" check.
 *
 * ## Phone storage
 *
 * We store E.164 with the `+`; Supabase stores `auth.users.phone` without it.
 * Every comparison goes through `supabasePhone()` rather than an inline
 * `replace`, so the two forms cannot drift apart.
 */

/**
 * The signed-in user's phone, from `auth.users`.
 *
 * Not taken from the session: the development bypass issues its own cookie and
 * carries no phone at all, so reading it there would make invitations work in
 * production and silently not in development — the worst place for a difference.
 */
async function phoneForUser(userId: string): Promise<string | null> {
  const rows = await db().execute<{ phone: string | null }>(
    sql`select phone from auth.users where id = ${userId} limit 1`,
  );
  const stored = rows[0]?.phone;
  // Supabase stores the number without its `+`. `normalisePhone` already knows
  // how to read that shape, so the conversion is not reimplemented here.
  return stored ? normalisePhone(stored) : null;
}

// ---------------------------------------------------------------------------
// Advisor side
// ---------------------------------------------------------------------------

export async function inviteToGroup(input: {
  groupId: string;
  phone: string;
}): Promise<ActionResult> {
  const phone = normalisePhone(input.phone);
  if (!phone) return { ok: false, error: "Enter a valid mobile number." };

  try {
    const { advisor } = await requirePublishingRights();

    const [group] = await db()
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, input.groupId), eq(groups.advisorId, advisor.id)))
      .limit(1);
    if (!group) throw new NotAuthorisedError("No such group.");

    const inserted = await db()
      .insert(groupInvitations)
      .values({ groupId: group.id, invitedPhone: phone })
      .onConflictDoNothing()
      .returning({ id: groupInvitations.id });

    if (inserted.length === 0) {
      return { ok: false, error: `${formatPhone(phone)} already has an open invitation.` };
    }

    revalidatePath(`/advisor/groups/${input.groupId}/manage/members`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  try {
    const { advisor } = await requirePublishingRights();

    const [invitation] = await db()
      .select({ id: groupInvitations.id, groupId: groupInvitations.groupId })
      .from(groupInvitations)
      .innerJoin(groups, eq(groups.id, groupInvitations.groupId))
      .where(
        and(
          eq(groupInvitations.id, invitationId),
          eq(groups.advisorId, advisor.id),
          eq(groupInvitations.status, "PENDING"),
        ),
      )
      .limit(1);

    if (!invitation) throw new NotAuthorisedError("That invitation is no longer open.");

    await db()
      .update(groupInvitations)
      .set({ status: "REVOKED", revokedAt: new Date() })
      .where(and(eq(groupInvitations.id, invitation.id), eq(groupInvitations.status, "PENDING")));

    revalidatePath(`/advisor/groups/${invitation.groupId}/manage/members`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export type GroupInvitation = {
  id: string;
  phone: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  createdAt: Date;
};

export async function listGroupInvitations(
  groupId: string,
): Promise<ActionResult<GroupInvitation[]>> {
  try {
    const { advisor } = await requirePublishingRights();

    const rows = await db()
      .select({
        id: groupInvitations.id,
        phone: groupInvitations.invitedPhone,
        status: groupInvitations.status,
        createdAt: groupInvitations.createdAt,
      })
      .from(groupInvitations)
      .innerJoin(groups, eq(groups.id, groupInvitations.groupId))
      .where(and(eq(groupInvitations.groupId, groupId), eq(groups.advisorId, advisor.id)))
      .orderBy(desc(groupInvitations.createdAt));

    return { ok: true, data: rows.map((r) => ({ ...r, phone: formatPhone(r.phone) })) };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

// ---------------------------------------------------------------------------
// Investor side
// ---------------------------------------------------------------------------

export type PendingInvitation = {
  id: string;
  groupId: string;
  groupName: string;
  groupDescription: string | null;
  advisorName: string | null;
  sebiRegistrationNo: string | null;
  invitedAt: Date;
};

export async function listMyInvitations(): Promise<ActionResult<PendingInvitation[]>> {
  try {
    const identity = await requireIdentity();
    if (!identity.investor) throw new NotAuthorisedError("This account is not an investor.");

    const phone = await phoneForUser(identity.user.id);
    if (!phone) return { ok: true, data: [] };

    const rows = await db()
      .select({
        id: groupInvitations.id,
        groupId: groups.id,
        groupName: groups.name,
        groupDescription: groups.description,
        advisorName: advisors.firmName,
        sebiRegistrationNo: advisors.sebiRegistrationNo,
        invitedAt: groupInvitations.createdAt,
      })
      .from(groupInvitations)
      .innerJoin(groups, eq(groups.id, groupInvitations.groupId))
      .innerJoin(advisors, eq(advisors.id, groups.advisorId))
      .where(
        and(
          eq(groupInvitations.invitedPhone, phone),
          eq(groupInvitations.status, "PENDING"),
          eq(advisors.verificationStatus, "VERIFIED"),
        ),
      )
      .orderBy(desc(groupInvitations.createdAt));

    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/**
 * Take up an invitation: mark it accepted and join, in one transaction.
 *
 * The two have to move together. An accepted invitation with no membership
 * locks the person out permanently — the invitation is spent and the group is
 * private — and a membership with the invitation still open leaves a second
 * unused key lying around.
 */
export async function acceptInvitation(invitationId: string): Promise<ActionResult<{ groupId: string }>> {
  try {
    const identity = await requireIdentity();
    if (!identity.investor) throw new NotAuthorisedError("This account is not an investor.");
    if (!identity.investor.riskAckAt) {
      throw new NotAuthorisedError(
        "Acknowledge the risk disclosure before joining a group of trading signals.",
      );
    }

    const phone = await phoneForUser(identity.user.id);
    if (!phone) throw new NotAuthorisedError("This invitation was sent to a different number.");

    const investorId = identity.investor.id;

    const groupId = await db().transaction(async (tx) => {
      const [invitation] = await tx
        .select({ id: groupInvitations.id, groupId: groupInvitations.groupId })
        .from(groupInvitations)
        .where(
          and(
            eq(groupInvitations.id, invitationId),
            eq(groupInvitations.invitedPhone, phone),
            eq(groupInvitations.status, "PENDING"),
          ),
        )
        .limit(1);

      if (!invitation) throw new NotAuthorisedError("That invitation is no longer open.");

      const accepted = await tx
        .update(groupInvitations)
        .set({
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedByInvestorId: investorId,
        })
        .where(and(eq(groupInvitations.id, invitation.id), eq(groupInvitations.status, "PENDING")))
        .returning({ id: groupInvitations.id });

      // Lost the race with another tab. The other one did the work.
      if (accepted.length === 0) throw new NotAuthorisedError("That invitation is no longer open.");

      const [tier] = await tx
        .select({ id: pricingTiers.id })
        .from(pricingTiers)
        .where(eq(pricingTiers.groupId, invitation.groupId))
        .limit(1);

      if (!tier) throw new NotAuthorisedError("This group is not open for joining yet.");

      await tx
        .insert(subscriptions)
        .values({ investorId, groupId: invitation.groupId, tierId: tier.id })
        .onConflictDoNothing();

      return invitation.groupId;
    });

    revalidatePath("/investor/home");
    revalidatePath("/investor/discover");
    revalidatePath(`/investor/groups/${groupId}`);
    return { ok: true, data: { groupId } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

function messageFor(error: unknown): string {
  if (error instanceof NotAuthorisedError) return error.message;
  if (error instanceof NotAuthenticatedError) return "Sign in first.";

  const message = error instanceof Error ? error.message : "";
  if (message.includes("group_invitations")) {
    console.error("[invitation] constraint rejected the change", error);
    return "That invitation cannot be changed.";
  }

  console.error("[invitation] action failed", error);
  return "Something went wrong. Try again.";
}
