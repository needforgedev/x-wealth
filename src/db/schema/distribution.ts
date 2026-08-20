import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import {
  billingPeriod,
  createdAt,
  groupVisibility,
  marketSegment,
  marketStance,
  paise,
  price,
  riskProfile,
  subscriptionStatus,
  symbol,
  timestampTz,
  tradeSide,
  type SignalTarget,
} from "./_shared";
import { advisors } from "./advisors";
import { investors } from "./investors";
import { strategies } from "./strategies";
import { forwardTests } from "./testing";

/**
 * A distribution group.
 *
 * There is no `linked_strategy_id` here any more. The spec
 * (`x-wealth-product.md` §6) modelled one strategy per group; an advisor
 * publishes any number of their strategies into any number of their groups, so
 * the relationship is the `group_strategies` table below. The column was
 * dropped in migration 0006 rather than left in place, because two sources of
 * truth for the same question is how they silently disagree.
 *
 * Note there is still no messages table. Free-form group chat stays cut: it is
 * an unmonitored channel where an RA can say anything, and it carries
 * compliance liability with no v1 revenue attached (`x-wealth-product.md` §8).
 * `market_views` below is not that channel — see its own note.
 */
export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advisorId: uuid("advisor_id")
      .notNull()
      .references(() => advisors.id, { onDelete: "restrict" }),

    name: text("name").notNull(),
    description: text("description"),
    visibility: groupVisibility("visibility").notNull().default("PUBLIC"),
    segment: marketSegment("segment").notNull(),

    createdAt: createdAt(),
    updatedAt: timestampTz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("groups_advisor_id_idx").on(t.advisorId)],
);

/**
 * Which of an advisor's strategies are published into which of their groups.
 *
 * `removed_at` is a membership lifecycle stamp, not a soft delete. Withdrawing
 * a strategy from a group hides nothing: the strategy, every version of it and
 * every test ever run against it stay exactly where they were and stay visible
 * on the advisor's record. What this records is that the advisor stopped
 * distributing it to a particular audience, and when — which is itself worth
 * keeping rather than erasing, so the row stays and a new one is inserted if
 * they publish it again.
 *
 * The unique index is partial for that reason: only one *live* link may exist
 * per (group, strategy), while the history of past links accumulates.
 */
export const groupStrategies = pgTable(
  "group_strategies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "restrict" }),

    publishedAt: timestampTz("published_at").notNull().defaultNow(),
    removedAt: timestampTz("removed_at"),
  },
  (t) => [
    index("group_strategies_group_id_idx").on(t.groupId),
    index("group_strategies_strategy_id_idx").on(t.strategyId),
    uniqueIndex("group_strategies_live_link_key")
      .on(t.groupId, t.strategyId)
      .where(sql`${t.removedAt} is null`),
  ],
);

export const pricingTiers = pgTable(
  "pricing_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),

    name: text("name").notNull(),
    pricePaise: paise("price_paise").notNull(),
    billingPeriod: billingPeriod("billing_period").notNull(),
    signalQuota: integer("signal_quota"),

    createdAt: createdAt(),
  },
  (t) => [index("pricing_tiers_group_id_idx").on(t.groupId)],
);

/**
 * Membership. Every group currently carries exactly one tier, priced at zero —
 * joining is free while charging for it is blocked on the legal question of
 * whether an unregistered platform may take a cut of an RA's subscription
 * income at all (execution-plan Track B, Q3). The tier row exists so that
 * turning pricing on later is a data change rather than a schema change.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "restrict" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => pricingTiers.id, { onDelete: "restrict" }),

    status: subscriptionStatus("status").notNull().default("ACTIVE"),
    startedAt: timestampTz("started_at").notNull().defaultNow(),
    endsAt: timestampTz("ends_at"),

    createdAt: createdAt(),
  },
  (t) => [
    index("subscriptions_investor_id_idx").on(t.investorId),
    index("subscriptions_group_id_idx").on(t.groupId),
    uniqueIndex("subscriptions_active_membership_key")
      .on(t.investorId, t.groupId)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);

/**
 * APPEND ONLY, IMMUTABLE (`x-wealth-product.md` §5.5).
 *
 * No edit, no delete, no backdating. `published_at` is server-generated — the
 * constraints migration overwrites whatever the client sends. An amendment is
 * a **new** signal row pointing at the one it amends.
 *
 * ## forward_test_id is temporarily nullable
 *
 * It was `NOT NULL`, and it must be again. A signal binding to a completed
 * forward test (PRD §5.7) is the product's whole proposition — a call with no
 * evidence behind it is the exact thing this exists to replace.
 *
 * The forward-test engine does not exist yet: it is Phase 3, blocked on the
 * market-data legal question and the data vendor. Distribution is being built
 * ahead of it, so the column was relaxed in migration 0006 to let advisors post
 * calls at all. The compensating controls, which are not optional:
 *
 *   - every signal with a null `forward_test_id` renders a visible
 *     "not forward-tested" badge, everywhere it appears
 *   - `strategy_id` stays `NOT NULL` — a call must still name the strategy it
 *     came from, so the binding is only missing its evidence, not its origin
 *   - `disclosure_block` stays `NOT NULL` and server-generated
 *
 * When Phase 3 lands: backfill, then restore `NOT NULL`. Until then nothing may
 * present an un-backed signal as verified.
 */
export const signals = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "restrict" }),
    /** Null only until the forward-test engine exists. See the note above. */
    forwardTestId: uuid("forward_test_id").references(() => forwardTests.id, {
      onDelete: "restrict",
    }),

    symbol: symbol().notNull(),
    side: tradeSide("side").notNull(),

    entryPrice: price("entry_price").notNull(),
    exitPrice: price("exit_price"),
    stopLoss: price("stop_loss").notNull(),

    /**
     * Staged exits, in order. Structured rather than three columns because the
     * count varies by call and a fourth target should not need a migration.
     */
    targets: jsonb("targets").$type<SignalTarget[]>().notNull().default([]),

    timeframe: text("timeframe").notNull(),
    validFrom: timestampTz("valid_from").notNull(),
    validUntil: timestampTz("valid_until"),

    rationale: text("rationale"),
    riskProfile: riskProfile("risk_profile").notNull(),
    chartRef: text("chart_ref"),

    /**
     * Auto-populated at publish, shown on the signal itself rather than in a
     * footer — disclosure at the point of decision, contemporaneous, not
     * buried (PRD §6).
     */
    disclosureBlock: text("disclosure_block").notNull(),

    /** Server-generated. Never client-supplied. */
    publishedAt: timestampTz("published_at").notNull().defaultNow(),

    amendsSignalId: uuid("amends_signal_id"),
  },
  (t) => [
    index("signals_group_id_idx").on(t.groupId),
    index("signals_strategy_id_idx").on(t.strategyId),
    index("signals_published_at_idx").on(t.publishedAt),
  ],
);

/**
 * APPEND ONLY. A directional view, not a call and not a chat message.
 *
 * "Bullish on NIFTY" is the smallest thing an advisor wants to say that is not
 * a trade instruction. It deliberately does **not** live in `signals`: a signal
 * means priced, actionable and evidence-backed, and keeping that word meaning
 * one thing is what will let `forward_test_id` be restored to `NOT NULL`
 * without first having to sort real calls from commentary.
 *
 * It equally deliberately is not the messages table this schema refuses to
 * grow. The difference is structural, and the constraints migration enforces
 * it: a stance from a fixed set, an optional instrument, and a note capped at
 * 280 characters. An open text column of unbounded length posted into a group
 * by a registered RA is the unmonitored advice channel by another name.
 *
 * A view from an RA is still research, so it carries the same contemporaneous
 * disclosure obligation as a call — hence `disclosure_block` is `NOT NULL`
 * here too.
 */
export const marketViews = pgTable(
  "market_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),

    stance: marketStance("stance").notNull(),

    /** Null when the view is about the market rather than one instrument. */
    symbol: symbol(),

    /** Optional context. Length-capped in the constraints migration. */
    note: text("note"),

    disclosureBlock: text("disclosure_block").notNull(),

    /** Server-generated, exactly as for signals. */
    publishedAt: timestampTz("published_at").notNull().defaultNow(),
  },
  (t) => [
    index("market_views_group_id_idx").on(t.groupId),
    index("market_views_published_at_idx").on(t.publishedAt),
  ],
);
