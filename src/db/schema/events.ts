import { boolean, date, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { MARKET_EVENT_TYPES } from "../../domain/events";
import { createdAt } from "./_shared";

/**
 * APPEND ONLY, no permitted mutation. `plan.md` W16-01, `CLAUDE.md` §7.4, §9.
 *
 * A dated fact a rule can reference — never content (W16-05: this table has
 * no headline and no body, deliberately). A revised date is a new row with a
 * later `known_on`; the old row stays, because a backtest evaluated over the
 * period when the old date was the public one must keep seeing what was
 * public then.
 *
 * ## `known_on` is the lookahead guard (W16-04)
 *
 * Earnings dates get revised, and a rule that reacts to a date before it was
 * announced has read the future — the subtle kind of leak nobody notices
 * because the numbers stay plausible. Every evaluator in
 * `src/domain/events.ts` filters on `known_on <= session`. Loaders set it to
 * the announcement date where the source carries one, and to `event_date`
 * itself where it does not — which under-informs the backtest rather than
 * over-informing it, the only acceptable direction of error.
 *
 * Exchange holidays are the calendar module's, generated from printed bars;
 * expiry days are arithmetic in `monthlyExpiry`. Neither is duplicated here.
 */

export const marketEventType = pgEnum("market_event_type", [...MARKET_EVENT_TYPES]);

export const marketEvents = pgTable(
  "market_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    eventType: marketEventType("event_type").notNull(),
    /** Exchange-qualified, e.g. NSE:TCS. Null only for market-wide types — see 0018's CHECK. */
    symbol: text("symbol"),
    eventDate: date("event_date").notNull(),

    /** The session by which the date was public. Never after the date itself. */
    knownOn: date("known_on").notNull(),
    /** False while the date is provisional and may move (W16-04). */
    confirmed: boolean("confirmed").notNull(),

    /** Where the row came from — a vendor name or a circular reference. */
    source: text("source").notNull(),

    createdAt: createdAt(),
  },
  (t) => [
    index("market_events_type_date_idx").on(t.eventType, t.eventDate),
    index("market_events_symbol_date_idx").on(t.symbol, t.eventDate),
  ],
);

export type MarketEventRow = typeof marketEvents.$inferSelect;
