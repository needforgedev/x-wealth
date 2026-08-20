"use server";

import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  advisors,
  groupStrategies,
  groups,
  marketViews,
  signals,
  strategies,
  subscriptions,
} from "@/db/schema";
import { priceToString } from "@/domain/money";
import {
  buildDisclosureBlock,
  parseMarketView,
  parseTradeCall,
  type MarketStance,
  type MarketViewDraft,
  type RiskProfile,
  type SignalTarget,
  type TradeCallDraft,
  type TradeSide,
} from "@/domain/signal";
import {
  NotAuthenticatedError,
  NotAuthorisedError,
  requireIdentity,
  requirePublishingRights,
} from "@/server/identity";
import type { ActionResult } from "@/server/actions/auth";

/**
 * What an advisor posts into a group: trade calls, amendments and market views.
 *
 * ## The missing forward test
 *
 * `signals.forward_test_id` is `NOT NULL` in the design and temporarily
 * nullable in the database (migration 0006), because the forward-test engine
 * does not exist yet. Every call posted through here therefore carries no
 * evidence, and that fact is recorded three ways on purpose:
 *
 *   1. in the row itself — `forward_test_id` is null
 *   2. in `disclosure_block`, which is append-only and says so in words
 *   3. on the card, via `NOT_FORWARD_TESTED_NOTICE`
 *
 * Belt, braces and a written record. When the engine lands, calls bind to a
 * completed test, the disclosure stops carrying that sentence, and the column
 * goes back to `NOT NULL`.
 *
 * ## Why a call must name a strategy that is actually in the group
 *
 * A call is an instance of a strategy firing. Letting an advisor post one
 * against a strategy they have not published into that group would put an
 * instruction in front of investors who cannot see the rules that produced it,
 * which is the Telegram tip channel this product is a response to.
 */

/** Either the advisor who owns the group, or an investor who has joined it. */
async function assertCanReadGroup(groupId: string): Promise<void> {
  const identity = await requireIdentity();

  if (identity.advisor) {
    const [owned] = await db()
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.advisorId, identity.advisor.id)))
      .limit(1);
    if (owned) return;
  }

  if (identity.investor) {
    const [member] = await db()
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.investorId, identity.investor.id),
          eq(subscriptions.groupId, groupId),
          eq(subscriptions.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (member) return;
  }

  throw new NotAuthorisedError("Join the group to see this.");
}

/**
 * The advisor's group and a strategy currently published into it.
 *
 * One query, so there is no window in which the strategy is withdrawn between
 * the check and the insert.
 */
async function requirePublishableInto(
  advisorId: string,
  groupId: string,
  strategyId: string,
): Promise<{ timeframe: string }> {
  const [row] = await db()
    .select({ timeframe: strategies.timeframe })
    .from(groupStrategies)
    .innerJoin(groups, eq(groups.id, groupStrategies.groupId))
    .innerJoin(strategies, eq(strategies.id, groupStrategies.strategyId))
    .where(
      and(
        eq(groupStrategies.groupId, groupId),
        eq(groupStrategies.strategyId, strategyId),
        isNull(groupStrategies.removedAt),
        eq(groups.advisorId, advisorId),
        eq(strategies.advisorId, advisorId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotAuthorisedError(
      "Publish that strategy to this group before posting a call from it.",
    );
  }
  return row;
}

async function requireOwnedGroup(advisorId: string, groupId: string): Promise<void> {
  const [row] = await db()
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.advisorId, advisorId)))
    .limit(1);
  if (!row) throw new NotAuthorisedError("No such group.");
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

export type TradeCallInput = TradeCallDraft & { groupId: string; strategyId: string };

export async function postTradeCall(input: TradeCallInput): Promise<ActionResult<{ id: string }>> {
  const parsed = parseTradeCall(input);
  if (!parsed.ok) return { ok: false, error: parsed.issues[0].message };
  const call = parsed.value;

  try {
    const { advisor } = await requirePublishingRights();
    const { timeframe } = await requirePublishableInto(advisor.id, input.groupId, input.strategyId);

    const [row] = await db()
      .insert(signals)
      .values({
        groupId: input.groupId,
        strategyId: input.strategyId,
        // Null until the forward-test engine exists. See the note at the top.
        forwardTestId: null,
        symbol: call.symbol,
        side: call.side,
        entryPrice: priceToString(call.entryPrice),
        exitPrice: call.exitPrice === null ? null : priceToString(call.exitPrice),
        stopLoss: priceToString(call.stopLoss),
        targets: call.targets,
        // Taken from the strategy, never from the form: a call cannot claim a
        // timeframe its own strategy does not run on.
        timeframe,
        validFrom: call.validFrom,
        validUntil: call.validUntil,
        rationale: call.rationale,
        riskProfile: call.riskProfile,
        disclosureBlock: buildDisclosureBlock(advisor, { forwardTested: false }),
      })
      .returning({ id: signals.id });

    revalidatePath(`/advisor/groups/${input.groupId}/manage`);
    revalidatePath(`/investor/groups/${input.groupId}`);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/**
 * Correct a published call by publishing a new one that points at it.
 *
 * `signals` is append-only, so this is the only correction there is: the
 * original stays visible forever and the amendment sits beside it. That is the
 * whole design — a call that turned out wrong cannot be quietly edited into one
 * that did not.
 *
 * The instrument, side, strategy and group are inherited from the original
 * rather than re-entered. An "amendment" that changed the instrument would be a
 * different call wearing the history of the one it replaced, and a trigger in
 * migration 0007 refuses it at the database as well.
 *
 * A strategy withdrawn from the group does not block this. Correcting a
 * mistake must not depend on still distributing the thing that caused it.
 */
export type AmendCallInput = Omit<TradeCallDraft, "symbol" | "side"> & { amendsSignalId: string };

export async function amendTradeCall(
  input: AmendCallInput,
): Promise<ActionResult<{ id: string; groupId: string }>> {
  try {
    const { advisor } = await requirePublishingRights();

    const amendedBy = alias(signals, "amending_call");
    const [original] = await db()
      .select({
        id: signals.id,
        groupId: signals.groupId,
        strategyId: signals.strategyId,
        symbol: signals.symbol,
        side: signals.side,
        timeframe: signals.timeframe,
        supersededById: amendedBy.id,
      })
      .from(signals)
      .innerJoin(groups, eq(groups.id, signals.groupId))
      .leftJoin(amendedBy, eq(amendedBy.amendsSignalId, signals.id))
      .where(and(eq(signals.id, input.amendsSignalId), eq(groups.advisorId, advisor.id)))
      .limit(1);

    if (!original) throw new NotAuthorisedError("No such call.");
    if (original.supersededById) {
      // One correction per call — enforced by a unique index too. Correcting a
      // correction means amending the amendment, so the chain stays a line.
      throw new NotAuthorisedError(
        "This call has already been amended. Amend the amendment instead.",
      );
    }

    const parsed = parseTradeCall({
      ...input,
      symbol: original.symbol,
      side: original.side as TradeSide,
    });
    if (!parsed.ok) return { ok: false, error: parsed.issues[0].message };
    const call = parsed.value;

    const [row] = await db()
      .insert(signals)
      .values({
        groupId: original.groupId,
        strategyId: original.strategyId,
        forwardTestId: null,
        symbol: original.symbol,
        side: original.side,
        entryPrice: priceToString(call.entryPrice),
        exitPrice: call.exitPrice === null ? null : priceToString(call.exitPrice),
        stopLoss: priceToString(call.stopLoss),
        targets: call.targets,
        timeframe: original.timeframe,
        validFrom: call.validFrom,
        validUntil: call.validUntil,
        rationale: call.rationale,
        riskProfile: call.riskProfile,
        disclosureBlock: buildDisclosureBlock(advisor, { forwardTested: false }),
        amendsSignalId: original.id,
      })
      .returning({ id: signals.id });

    revalidatePath(`/advisor/groups/${original.groupId}/manage`);
    revalidatePath(`/investor/groups/${original.groupId}`);
    return { ok: true, data: { id: row.id, groupId: original.groupId } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export type MarketViewInput = MarketViewDraft & { groupId: string };

export async function postMarketView(input: MarketViewInput): Promise<ActionResult<{ id: string }>> {
  const parsed = parseMarketView(input);
  if (!parsed.ok) return { ok: false, error: parsed.issues[0].message };
  const view = parsed.value;

  try {
    const { advisor } = await requirePublishingRights();
    await requireOwnedGroup(advisor.id, input.groupId);

    const [row] = await db()
      .insert(marketViews)
      .values({
        groupId: input.groupId,
        stance: view.stance,
        symbol: view.symbol,
        note: view.note,
        // A view is not a call, so there is no forward test to be missing. The
        // disclosure still has to be there — a directional view from a
        // registered RA is research either way.
        disclosureBlock: buildDisclosureBlock(advisor, { forwardTested: true }),
      })
      .returning({ id: marketViews.id });

    revalidatePath(`/advisor/groups/${input.groupId}/manage`);
    revalidatePath(`/investor/groups/${input.groupId}`);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type FeedCall = {
  kind: "CALL";
  id: string;
  publishedAt: Date;
  strategyId: string;
  strategyName: string;
  symbol: string;
  side: TradeSide;
  entryPrice: string;
  exitPrice: string | null;
  stopLoss: string;
  targets: SignalTarget[];
  timeframe: string;
  validFrom: Date;
  validUntil: Date | null;
  rationale: string | null;
  riskProfile: RiskProfile;
  disclosureBlock: string;
  /** False for every call until the forward-test engine exists. */
  forwardTested: boolean;
  /** Set when this call is itself a correction of an earlier one. */
  amendsPublishedAt: Date | null;
  /** Set when a later call corrects this one. The original still stands here. */
  supersededAt: Date | null;
};

export type FeedView = {
  kind: "VIEW";
  id: string;
  publishedAt: Date;
  stance: MarketStance;
  symbol: string | null;
  note: string | null;
  disclosureBlock: string;
};

export type FeedItem = FeedCall | FeedView;

export type FeedPage = {
  items: FeedItem[];
  /** ISO timestamp to pass back as `before`, or null at the end of the feed. */
  nextCursor: string | null;
};

const DEFAULT_PAGE = 20;
const MAX_PAGE = 50;

/**
 * Calls and views in one stream, newest first.
 *
 * Two queries merged in memory rather than a UNION: the two rows have almost
 * nothing in common, and flattening them into shared columns to satisfy a
 * UNION would mean nullable everything and a `kind` column doing the work the
 * type system should do.
 *
 * ## Paging across two tables
 *
 * The cursor is a timestamp rather than an offset, because both tables are
 * append-only at the top — an offset would re-show or skip rows as new posts
 * arrive. Each table is asked for one more row than the page needs; the merged
 * result is cut to the page and the last item's timestamp becomes the cursor.
 *
 * Two posts sharing a `published_at` to the microsecond would sit either side
 * of the cut and one would be skipped. `now()` at that resolution makes this
 * effectively impossible, and the alternative — a compound cursor over two
 * tables with no shared key — is not worth the complexity it costs.
 */
export async function groupFeed(
  groupId: string,
  options: { before?: string; limit?: number } = {},
): Promise<ActionResult<FeedPage>> {
  try {
    await assertCanReadGroup(groupId);

    const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE, 1), MAX_PAGE);

    let before: Date | null = null;
    if (options.before) {
      const parsed = new Date(options.before);
      if (!Number.isNaN(parsed.getTime())) before = parsed;
    }

    const amended = alias(signals, "amended_call");
    const amendedBy = alias(signals, "amending_call");

    const callWhere = before
      ? and(eq(signals.groupId, groupId), lt(signals.publishedAt, before))
      : eq(signals.groupId, groupId);

    const viewWhere = before
      ? and(eq(marketViews.groupId, groupId), lt(marketViews.publishedAt, before))
      : eq(marketViews.groupId, groupId);

    const [calls, views] = await Promise.all([
      db()
        .select({
          id: signals.id,
          publishedAt: signals.publishedAt,
          strategyId: signals.strategyId,
          strategyName: strategies.name,
          symbol: signals.symbol,
          side: signals.side,
          entryPrice: signals.entryPrice,
          exitPrice: signals.exitPrice,
          stopLoss: signals.stopLoss,
          targets: signals.targets,
          timeframe: signals.timeframe,
          validFrom: signals.validFrom,
          validUntil: signals.validUntil,
          rationale: signals.rationale,
          riskProfile: signals.riskProfile,
          disclosureBlock: signals.disclosureBlock,
          forwardTestId: signals.forwardTestId,
          amendsPublishedAt: amended.publishedAt,
          supersededAt: amendedBy.publishedAt,
        })
        .from(signals)
        .innerJoin(strategies, eq(strategies.id, signals.strategyId))
        .leftJoin(amended, eq(amended.id, signals.amendsSignalId))
        // At most one row can match: a unique index allows only one amendment
        // per call, so this join cannot fan the result out.
        .leftJoin(amendedBy, eq(amendedBy.amendsSignalId, signals.id))
        .where(callWhere)
        .orderBy(desc(signals.publishedAt))
        .limit(limit + 1),

      db()
        .select({
          id: marketViews.id,
          publishedAt: marketViews.publishedAt,
          stance: marketViews.stance,
          symbol: marketViews.symbol,
          note: marketViews.note,
          disclosureBlock: marketViews.disclosureBlock,
        })
        .from(marketViews)
        .where(viewWhere)
        .orderBy(desc(marketViews.publishedAt))
        .limit(limit + 1),
    ]);

    const merged: FeedItem[] = [
      ...calls.map(({ forwardTestId, ...call }) => ({
        kind: "CALL" as const,
        ...call,
        forwardTested: forwardTestId !== null,
      })),
      ...views.map((view) => ({ kind: "VIEW" as const, ...view })),
    ];

    merged.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    const items = merged.slice(0, limit);
    const nextCursor =
      merged.length > limit && items.length > 0
        ? items[items.length - 1].publishedAt.toISOString()
        : null;

    return { ok: true, data: { items, nextCursor } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/**
 * One call, for the amendment form.
 *
 * Returns the fields an amendment may change, plus the ones it inherits so the
 * form can show what is fixed.
 */
export type AmendableCall = {
  id: string;
  groupId: string;
  strategyName: string;
  symbol: string;
  side: TradeSide;
  entryPrice: string;
  exitPrice: string | null;
  stopLoss: string;
  targets: SignalTarget[];
  validFrom: Date;
  validUntil: Date | null;
  rationale: string | null;
  riskProfile: RiskProfile;
  publishedAt: Date;
};

export async function callToAmend(signalId: string): Promise<ActionResult<AmendableCall>> {
  try {
    const { advisor } = await requirePublishingRights();

    const amendedBy = alias(signals, "amending_call");
    const [row] = await db()
      .select({
        id: signals.id,
        groupId: signals.groupId,
        strategyName: strategies.name,
        symbol: signals.symbol,
        side: signals.side,
        entryPrice: signals.entryPrice,
        exitPrice: signals.exitPrice,
        stopLoss: signals.stopLoss,
        targets: signals.targets,
        validFrom: signals.validFrom,
        validUntil: signals.validUntil,
        rationale: signals.rationale,
        riskProfile: signals.riskProfile,
        publishedAt: signals.publishedAt,
        supersededById: amendedBy.id,
      })
      .from(signals)
      .innerJoin(groups, eq(groups.id, signals.groupId))
      .innerJoin(strategies, eq(strategies.id, signals.strategyId))
      .leftJoin(amendedBy, eq(amendedBy.amendsSignalId, signals.id))
      .where(and(eq(signals.id, signalId), eq(groups.advisorId, advisor.id)))
      .limit(1);

    if (!row) throw new NotAuthorisedError("No such call.");
    if (row.supersededById) {
      throw new NotAuthorisedError("This call has already been amended.");
    }

    // `supersededById` was selected to make the check above and is not part of
    // what the form needs, so it is not carried through.
    return {
      ok: true,
      data: {
        id: row.id,
        groupId: row.groupId,
        strategyName: row.strategyName,
        symbol: row.symbol,
        side: row.side,
        entryPrice: row.entryPrice,
        exitPrice: row.exitPrice,
        stopLoss: row.stopLoss,
        targets: row.targets,
        validFrom: row.validFrom,
        validUntil: row.validUntil,
        rationale: row.rationale,
        riskProfile: row.riskProfile,
        publishedAt: row.publishedAt,
      },
    };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/** The advisor behind a group, for the disclosure line on a feed. */
export async function groupAdvisor(
  groupId: string,
): Promise<ActionResult<{ name: string | null; sebiRegistrationNo: string | null }>> {
  try {
    await assertCanReadGroup(groupId);

    const [row] = await db()
      .select({ name: advisors.firmName, sebiRegistrationNo: advisors.sebiRegistrationNo })
      .from(groups)
      .innerJoin(advisors, eq(advisors.id, groups.advisorId))
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!row) throw new NotAuthorisedError("No such group.");
    return { ok: true, data: row };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

function messageFor(error: unknown): string {
  if (error instanceof NotAuthorisedError) return error.message;
  if (error instanceof NotAuthenticatedError) return "Sign in first.";

  const message = error instanceof Error ? error.message : "";
  if (message.includes("append-only")) {
    // The trigger fired, which means this file tried to change a published
    // call. That is a bug here, not user error.
    console.error("[signal] attempted to mutate an append-only row", error);
    return "A published call cannot be changed. Post an amendment instead.";
  }
  if (message.includes("signals_one_amendment_per_call_key")) {
    return "This call has already been amended. Amend the amendment instead.";
  }
  if (message.includes("amendment must keep")) {
    console.error("[signal] amendment changed an inherited field", error);
    return "An amendment cannot change the instrument, side or strategy.";
  }

  console.error("[signal] action failed", error);
  return "Something went wrong. Try again.";
}
