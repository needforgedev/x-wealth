import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { createdAt, experienceLevel, timestampTz } from "./_shared";
import { authUsers } from "./auth";

/**
 * Free vs paid boundary is blocker **B-9**, so these two values are a
 * placeholder rather than a decision.
 *
 * What is already decided is the shape: `CLAUDE.md` §11.5 says **cap compute,
 * not features** — backtests are the real cost of goods. And §3 fact 1 is the
 * constraint that matters more than the price: we charge for the tool, never
 * for access to what a strategy says to buy. "₹X/month for unlimited backtests"
 * is software; "₹X/month to see the top strategies" is publishing. Same money,
 * different regulator.
 */
export const planTier = pgEnum("plan_tier", ["FREE", "PRO"]);

/**
 * One person, one row. There is no second persona.
 *
 * Replaced `advisors` and `investors` in migration 0010. v2 has a single user
 * (`CLAUDE.md` §6) — a retail trader with an existing broker account who
 * authors, tests and eventually runs their own strategies, and who is the only
 * consumer of everything they make.
 *
 * ## What is absent, and must stay absent
 *
 * **Nothing SEBI-registration-shaped.** No registration number, no enlistment
 * number, no verification status, no expiry, no uploaded documents. §2 abandons
 * the Research Analyst direction outright, so there is no registration to hold
 * and nothing may be gated on one. If a field like that reappears here, the
 * product has drifted back into being a publisher of investment
 * recommendations.
 *
 * **No score, grade, rating, tier-by-performance or reputation column.** §8.7:
 * we report what happened and never characterise it. `plan_tier` is what the
 * user pays, and it must never be derived from how they trade.
 *
 * **No column that makes one user visible to another.** §8.5 is the constraint
 * the whole compliance structure rests on.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  /**
   * Supabase Auth owns `auth.users`. We key off it by foreign key and never
   * migrate that table — Drizzle reads it, nothing more.
   */
  authUserId: uuid("auth_user_id")
    .notNull()
    .unique()
    .references(() => authUsers.id, { onDelete: "restrict" }),

  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  phone: text("phone"),

  experienceLevel: experienceLevel("experience_level"),

  /**
   * Set once, when the disclosure is acknowledged. Three points acknowledged
   * separately rather than one blanket agreement — carried across from the
   * investor flow, where it was the one piece worth keeping.
   */
  riskAckAt: timestampTz("risk_ack_at"),
  suitability: jsonb("suitability"),

  planTier: planTier("plan_tier").notNull().default("FREE"),

  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
