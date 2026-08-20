"use server";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  advisors,
  groupStrategies,
  groups,
  investors,
  pricingTiers,
  strategies,
  strategyVersions,
  subscriptions,
} from "@/db/schema";
import {
  activeMemberCount,
  joinedByInvestor,
  livePublishedCount,
} from "@/db/queries/group-metrics";
import type { StrategyDefinition } from "@/domain/strategy";
import {
  NotAuthenticatedError,
  NotAuthorisedError,
  requireIdentity,
  requireInvestor,
  requirePublishingRights,
} from "@/server/identity";
import type { ActionResult } from "@/server/actions/auth";

/**
 * Groups: how an advisor distributes strategies, and how an investor joins.
 *
 * Three rules run through everything here:
 *
 * - **Creating a group needs live publishing rights.** Same gate as authoring a
 *   strategy (`x-wealth-product.md` §5.4) — a lapsed registration cannot
 *   acquire an audience.
 * - **An advisor may only publish their own strategies, into their own
 *   groups.** Both halves are checked on every call rather than assumed from
 *   the URL.
 * - **An investor cannot join before acknowledging the risk disclosure**
 *   (PRD §5.9). That gate is the last thing before the app, so it is also the
 *   last thing before a group.
 *
 * Joining is free. Every group carries a single ₹0 tier, created with it, so
 * `subscriptions.tier_id` has something real to point at and switching pricing
 * on later is a data change rather than a schema change. Charging is blocked on
 * the legal question of whether we may take a cut of an RA's fee at all
 * (execution-plan Track B, Q3).
 */

const MARKET_SEGMENTS = ["EQUITY", "FNO", "COMMODITY", "CURRENCY"] as const;
type MarketSegment = (typeof MARKET_SEGMENTS)[number];

const VISIBILITIES = ["PUBLIC", "PRIVATE"] as const;
type Visibility = (typeof VISIBILITIES)[number];

/** The free tier every group is created with. */
const FREE_TIER = { name: "Free", pricePaise: 0, billingPeriod: "MONTHLY" } as const;

// ---------------------------------------------------------------------------
// Advisor — owning groups
// ---------------------------------------------------------------------------

export async function createGroup(input: {
  name: string;
  description: string;
  segment: string;
  visibility: string;
}): Promise<ActionResult<{ groupId: string }>> {
  const name = input.name.trim();
  const description = input.description.trim();

  if (name.length < 3) return { ok: false, error: "Give the group a name." };
  if (name.length > 80) return { ok: false, error: "That name is too long." };
  if (description.length > 500) return { ok: false, error: "Keep the description under 500 characters." };
  if (!MARKET_SEGMENTS.includes(input.segment as MarketSegment)) {
    return { ok: false, error: "Choose a market segment." };
  }
  if (!VISIBILITIES.includes(input.visibility as Visibility)) {
    return { ok: false, error: "Choose whether the group is public or private." };
  }

  try {
    const { advisor } = await requirePublishingRights();

    const groupId = await db().transaction(async (tx) => {
      const [group] = await tx
        .insert(groups)
        .values({
          advisorId: advisor.id,
          name,
          description: description || null,
          segment: input.segment as MarketSegment,
          visibility: input.visibility as Visibility,
        })
        .returning({ id: groups.id });

      await tx.insert(pricingTiers).values({ groupId: group.id, ...FREE_TIER });

      return group.id;
    });

    revalidatePath("/advisor/groups");
    return { ok: true, data: { groupId } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/**
 * Name, description and visibility only.
 *
 * `segment` is fixed at creation: strategies are published into a group on the
 * understanding of what it trades, and changing that under them would silently
 * re-describe work an investor already joined for.
 */
export async function updateGroup(input: {
  groupId: string;
  name: string;
  description: string;
  visibility: string;
}): Promise<ActionResult> {
  const name = input.name.trim();
  const description = input.description.trim();

  if (name.length < 3) return { ok: false, error: "Give the group a name." };
  if (name.length > 80) return { ok: false, error: "That name is too long." };
  if (description.length > 500) return { ok: false, error: "Keep the description under 500 characters." };
  if (!VISIBILITIES.includes(input.visibility as Visibility)) {
    return { ok: false, error: "Choose whether the group is public or private." };
  }

  try {
    const { advisor } = await requirePublishingRights();

    const updated = await db()
      .update(groups)
      .set({
        name,
        description: description || null,
        visibility: input.visibility as Visibility,
        updatedAt: new Date(),
      })
      .where(and(eq(groups.id, input.groupId), eq(groups.advisorId, advisor.id)))
      .returning({ id: groups.id });

    if (updated.length === 0) throw new NotAuthorisedError("No such group.");

    revalidatePath(`/advisor/groups/${input.groupId}`);
    revalidatePath("/advisor/groups");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function listAdvisorGroups(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      description: string | null;
      segment: MarketSegment;
      visibility: Visibility;
      memberCount: number;
      strategyCount: number;
    }>
  >
> {
  try {
    const { advisor } = await requirePublishingRights();

    const rows = await db()
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        segment: groups.segment,
        visibility: groups.visibility,
        memberCount: activeMemberCount(),
        strategyCount: livePublishedCount(),
      })
      .from(groups)
      .where(eq(groups.advisorId, advisor.id))
      .orderBy(desc(groups.createdAt));

    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

// ---------------------------------------------------------------------------
// Advisor — publishing strategies into groups
// ---------------------------------------------------------------------------

/**
 * Both the group and the strategy must belong to the caller — the URL is not
 * evidence of either, so both halves are re-checked here on every call.
 *
 * Two advisors racing this cannot produce a duplicate: the partial unique index
 * on live links makes the second insert a no-op, which is reported as "already
 * in this group" rather than as an error.
 */
export async function publishStrategyToGroup(input: {
  groupId: string;
  strategyId: string;
}): Promise<ActionResult> {
  try {
    const { advisor } = await requirePublishingRights();

    const [pair] = await db()
      .select({ groupId: groups.id, strategyId: strategies.id })
      .from(groups)
      .innerJoin(
        strategies,
        and(eq(strategies.id, input.strategyId), eq(strategies.advisorId, advisor.id)),
      )
      .where(and(eq(groups.id, input.groupId), eq(groups.advisorId, advisor.id)))
      .limit(1);

    if (!pair) throw new NotAuthorisedError("No such group or strategy.");

    const inserted = await db()
      .insert(groupStrategies)
      .values({ groupId: pair.groupId, strategyId: pair.strategyId })
      .onConflictDoNothing()
      .returning({ id: groupStrategies.id });

    if (inserted.length === 0) {
      return { ok: false, error: "That strategy is already in this group." };
    }

    revalidatePath(`/advisor/groups/${input.groupId}`);
    revalidatePath(`/groups/${input.groupId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/**
 * Stop distributing a strategy to a group.
 *
 * This hides nothing. The strategy, all of its versions and every test ever run
 * against it stay exactly where they were and stay on the advisor's record. The
 * link row stays too, stamped with when it ended — withdrawal is itself part of
 * the history, so it is recorded rather than erased.
 */
export async function withdrawStrategyFromGroup(input: {
  groupId: string;
  strategyId: string;
}): Promise<ActionResult> {
  try {
    const { advisor } = await requirePublishingRights();

    const [group] = await db()
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, input.groupId), eq(groups.advisorId, advisor.id)))
      .limit(1);

    if (!group) throw new NotAuthorisedError("No such group.");

    const updated = await db()
      .update(groupStrategies)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(groupStrategies.groupId, group.id),
          eq(groupStrategies.strategyId, input.strategyId),
          isNull(groupStrategies.removedAt),
        ),
      )
      .returning({ id: groupStrategies.id });

    if (updated.length === 0) throw new NotAuthorisedError("That strategy is not in this group.");

    revalidatePath(`/advisor/groups/${input.groupId}`);
    revalidatePath(`/groups/${input.groupId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export type PublishedStrategy = {
  id: string;
  name: string;
  description: string | null;
  timeframe: string;
  publishedAt: Date;
  /**
   * The head version only. The full iteration ledger — every revision, every
   * abandoned test — is not shown to investors yet, which is a departure from
   * `x-wealth-product.md` §5.8. Nothing is lost by it: `strategy_versions`
   * still accumulates, so turning the ledger on is a display change.
   */
  versionNo: number | null;
  definition: StrategyDefinition | null;
};

async function publishedStrategiesFor(groupId: string): Promise<PublishedStrategy[]> {
  return db()
    .select({
      id: strategies.id,
      name: strategies.name,
      description: strategies.description,
      timeframe: strategies.timeframe,
      publishedAt: groupStrategies.publishedAt,
      versionNo: strategyVersions.versionNo,
      definition: strategyVersions.definition,
    })
    .from(groupStrategies)
    .innerJoin(strategies, eq(strategies.id, groupStrategies.strategyId))
    .leftJoin(strategyVersions, eq(strategyVersions.id, strategies.currentVersionId))
    .where(and(eq(groupStrategies.groupId, groupId), isNull(groupStrategies.removedAt)))
    .orderBy(asc(groupStrategies.publishedAt));
}

export type AdvisorGroupDetail = {
  group: {
    id: string;
    name: string;
    description: string | null;
    segment: MarketSegment;
    visibility: Visibility;
    memberCount: number;
  };
  published: PublishedStrategy[];
  /** Everything the advisor could publish here but has not. */
  available: Array<{ id: string; name: string; description: string | null }>;
};

export async function advisorGroupDetail(
  groupId: string,
): Promise<ActionResult<AdvisorGroupDetail>> {
  try {
    const { advisor } = await requirePublishingRights();

    const [group] = await db()
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        segment: groups.segment,
        visibility: groups.visibility,
        memberCount: activeMemberCount(),
      })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.advisorId, advisor.id)))
      .limit(1);

    if (!group) throw new NotAuthorisedError("No such group.");

    const published = await publishedStrategiesFor(group.id);
    const publishedIds = new Set(published.map((s) => s.id));

    const all = await db()
      .select({ id: strategies.id, name: strategies.name, description: strategies.description })
      .from(strategies)
      .where(eq(strategies.advisorId, advisor.id))
      .orderBy(desc(strategies.updatedAt));

    return {
      ok: true,
      data: { group, published, available: all.filter((s) => !publishedIds.has(s.id)) },
    };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

// ---------------------------------------------------------------------------
// Investor — browsing and joining
// ---------------------------------------------------------------------------

export type BrowsableGroup = {
  id: string;
  name: string;
  description: string | null;
  segment: MarketSegment;
  advisorName: string | null;
  sebiRegistrationNo: string | null;
  memberCount: number;
  strategyCount: number;
  joined: boolean;
};

/**
 * Public groups, with whether this investor is already in each.
 *
 * Only names and counts are exposed here. What a strategy actually *does* — its
 * rules, its stop, its sizing — is visible to members, because that is the
 * thing being distributed. Discovery deliberately carries no performance
 * figures at all: none exist, and inventing them is the specific failure this
 * product is a response to.
 */
export async function browseGroups(): Promise<ActionResult<BrowsableGroup[]>> {
  try {
    const investor = await requireInvestor();
    requireRiskAcknowledged(investor.riskAckAt);

    const rows = await db()
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        segment: groups.segment,
        advisorName: advisors.firmName,
        sebiRegistrationNo: advisors.sebiRegistrationNo,
        memberCount: activeMemberCount(),
        strategyCount: livePublishedCount(),
        joined: joinedByInvestor(investor.id),
      })
      .from(groups)
      .innerJoin(advisors, eq(advisors.id, groups.advisorId))
      .where(and(eq(groups.visibility, "PUBLIC"), eq(advisors.verificationStatus, "VERIFIED")))
      .orderBy(desc(groups.createdAt));

    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function listJoinedGroups(): Promise<
  ActionResult<Array<{ id: string; name: string; segment: MarketSegment; strategyCount: number }>>
> {
  try {
    const investor = await requireInvestor();

    const rows = await db()
      .select({
        id: groups.id,
        name: groups.name,
        segment: groups.segment,
        strategyCount: livePublishedCount(),
      })
      .from(subscriptions)
      .innerJoin(groups, eq(groups.id, subscriptions.groupId))
      .where(and(eq(subscriptions.investorId, investor.id), eq(subscriptions.status, "ACTIVE")))
      .orderBy(desc(subscriptions.startedAt));

    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function joinGroup(groupId: string): Promise<ActionResult> {
  try {
    const identity = await requireIdentity();
    if (!identity.investor) throw new NotAuthorisedError("This account is not an investor.");
    requireRiskAcknowledged(identity.investor.riskAckAt);

    const [group] = await db()
      .select({ id: groups.id, visibility: groups.visibility, advisorUserId: advisors.userId })
      .from(groups)
      .innerJoin(advisors, eq(advisors.id, groups.advisorId))
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!group) throw new NotAuthorisedError("No such group.");
    if (group.visibility !== "PUBLIC") {
      throw new NotAuthorisedError("This group is private. You need an invitation.");
    }
    // An advisor subscribing to themselves would inflate the only number a
    // prospective member can currently see.
    if (group.advisorUserId === identity.user.id) {
      throw new NotAuthorisedError("You cannot join your own group.");
    }

    const [tier] = await db()
      .select({ id: pricingTiers.id })
      .from(pricingTiers)
      .where(eq(pricingTiers.groupId, groupId))
      .orderBy(asc(pricingTiers.pricePaise))
      .limit(1);

    if (!tier) throw new NotAuthorisedError("This group is not open for joining yet.");

    // The partial unique index makes a double-join impossible; this turns the
    // race into a no-op rather than an error page.
    await db()
      .insert(subscriptions)
      .values({ investorId: identity.investor.id, groupId, tierId: tier.id })
      .onConflictDoNothing();

    revalidatePath("/discover");
    revalidatePath(`/groups/${groupId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function leaveGroup(groupId: string): Promise<ActionResult> {
  try {
    const investor = await requireInvestor();

    await db()
      .update(subscriptions)
      .set({ status: "CANCELLED", endsAt: new Date() })
      .where(
        and(
          eq(subscriptions.investorId, investor.id),
          eq(subscriptions.groupId, groupId),
          eq(subscriptions.status, "ACTIVE"),
        ),
      );

    revalidatePath("/discover");
    revalidatePath(`/groups/${groupId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export type InvestorGroupDetail = {
  group: {
    id: string;
    name: string;
    description: string | null;
    segment: MarketSegment;
    advisorName: string | null;
    sebiRegistrationNo: string | null;
    memberCount: number;
  };
  joined: boolean;
  published: PublishedStrategy[];
};

export async function investorGroupDetail(
  groupId: string,
): Promise<ActionResult<InvestorGroupDetail>> {
  try {
    const investor = await requireInvestor();
    requireRiskAcknowledged(investor.riskAckAt);

    const [group] = await db()
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        segment: groups.segment,
        visibility: groups.visibility,
        advisorName: advisors.firmName,
        sebiRegistrationNo: advisors.sebiRegistrationNo,
        memberCount: activeMemberCount(),
        joined: joinedByInvestor(investor.id),
      })
      .from(groups)
      .innerJoin(advisors, eq(advisors.id, groups.advisorId))
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!group) throw new NotAuthorisedError("No such group.");
    if (group.visibility !== "PUBLIC" && !group.joined) {
      throw new NotAuthorisedError("This group is private.");
    }

    // `visibility` was selected to make the private-group check above, and is
    // not part of what an investor is shown, so it is not carried through.
    return {
      ok: true,
      data: {
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
          segment: group.segment,
          advisorName: group.advisorName,
          sebiRegistrationNo: group.sebiRegistrationNo,
          memberCount: group.memberCount,
        },
        joined: group.joined,
        published: group.joined ? await publishedStrategiesFor(groupId) : [],
      },
    };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/** Membership check for anything that serves a group's contents. */
export async function requireMembership(groupId: string): Promise<{ investorId: string }> {
  const investor = await requireInvestor();
  requireRiskAcknowledged(investor.riskAckAt);

  const [row] = await db()
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.investorId, investor.id),
        eq(subscriptions.groupId, groupId),
        eq(subscriptions.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!row) throw new NotAuthorisedError("Join the group to see this.");
  return { investorId: investor.id };
}

function requireRiskAcknowledged(riskAckAt: Date | null): void {
  if (!riskAckAt) {
    throw new NotAuthorisedError(
      "Acknowledge the risk disclosure before joining a group of trading signals.",
    );
  }
}

function messageFor(error: unknown): string {
  if (error instanceof NotAuthorisedError) return error.message;
  if (error instanceof NotAuthenticatedError) return "Sign in first.";
  console.error("[group] action failed", error);
  return "Something went wrong. Try again.";
}

/**
 * Who is in a group, for its advisor.
 *
 * Name and when they joined, and nothing else. A registered RA has a legitimate
 * need to know who their subscribers are; they do not need a phone number or an
 * email rendered onto a screen to know it, and `x-wealth-product.md` §10 is
 * strict about where personal data is allowed to appear. If a real
 * record-keeping obligation later needs contact details, that is a deliberate
 * change with an audit-log entry attached, not a column quietly added here.
 */
export async function listGroupMembers(
  groupId: string,
): Promise<ActionResult<Array<{ id: string; name: string | null; joinedAt: Date }>>> {
  try {
    const { advisor } = await requirePublishingRights();

    const [group] = await db()
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.advisorId, advisor.id)))
      .limit(1);
    if (!group) throw new NotAuthorisedError("No such group.");

    const rows = await db()
      .select({
        id: subscriptions.id,
        name: investors.contactName,
        joinedAt: subscriptions.startedAt,
      })
      .from(subscriptions)
      .innerJoin(investors, eq(investors.id, subscriptions.investorId))
      .where(and(eq(subscriptions.groupId, groupId), eq(subscriptions.status, "ACTIVE")))
      .orderBy(desc(subscriptions.startedAt));

    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
