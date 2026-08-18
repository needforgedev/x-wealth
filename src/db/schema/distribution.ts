import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import {
  billingPeriod,
  createdAt,
  groupVisibility,
  marketSegment,
  paise,
  price,
  riskProfile,
  subscriptionStatus,
  symbol,
  timestampTz,
  tradeSide,
} from "./_shared";
import { advisors } from "./advisors";
import { investors } from "./investors";
import { strategies } from "./strategies";
import { forwardTests } from "./testing";

/**
 * A distribution group. Every group must display its linked strategy's **full**
 * record — every version, every test, every abandonment (PRD §5.8).
 *
 * Note there is no messages table anywhere in this schema. Free-form group chat
 * is cut for v1: it is an unmonitored channel where an RA can say anything, and
 * it carries compliance liability with no v1 revenue attached. Announcements
 * only (`x-wealth-product.md` §8).
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

    linkedStrategyId: uuid("linked_strategy_id").references(() => strategies.id),

    createdAt: createdAt(),
    updatedAt: timestampTz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("groups_advisor_id_idx").on(t.advisorId)],
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
  ],
);

/**
 * APPEND ONLY, IMMUTABLE (`x-wealth-product.md` §5.5).
 *
 * No edit, no delete, no backdating. `published_at` is server-generated — the
 * constraints migration overwrites whatever the client sends. An amendment is
 * a **new** signal row pointing at the one it amends.
 *
 * `forward_test_id` is mandatory by design: a signal must bind to a completed
 * forward-test record (PRD §5.7). A signal with no evidence behind it is the
 * exact thing this product exists to replace.
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
    forwardTestId: uuid("forward_test_id")
      .notNull()
      .references(() => forwardTests.id, { onDelete: "restrict" }),

    symbol: symbol().notNull(),
    side: tradeSide("side").notNull(),

    entryPrice: price("entry_price").notNull(),
    exitPrice: price("exit_price"),
    stopLoss: price("stop_loss").notNull(),

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
