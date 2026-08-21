import { sql } from "drizzle-orm";
import { bigint, check, date, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { instrumentKind, price, priceAdjustment, symbol, symbolCheck, timestampTz } from "./_shared";

/**
 * Price history and the instruments it belongs to.
 *
 * NOT append-only, and deliberately absent from the list in `index.ts`. Every
 * other table that records something is immutable because it records a
 * *decision or a result* — a backtest that ran, a trade that closed. These two
 * record the *world*, and the world gets restated: vendors reissue history when
 * they correct a corporate action, and pinning the first version we happened to
 * download would mean permanently backtesting against known-bad data.
 *
 * What is immutable is the claim a run makes about its data. That lives in
 * `backtest_runs.methodology`, which carries the source name, the adjustment
 * and the vintage — so a restatement changes future runs and leaves past ones
 * describing exactly what they saw (`x-wealth-product.md` §5.3, PRD §5.3).
 */

/**
 * The tradeable — and the not-tradeable.
 *
 * `kind` is here because four of the first six instruments are spot indices.
 * You cannot buy NIFTY 50; you can only buy something derived from it. A layer
 * that hands the engine an index and a cash equity as interchangeable
 * `Instrument`s is one refactor away from a backtest that "bought" the index at
 * its spot price, which would look entirely plausible and be entirely fictional.
 */
export const instruments = pgTable(
  "instruments",
  {
    /** Exchange-qualified — `NSE:RELIANCE`, never `RELIANCE`. */
    symbol: symbol().primaryKey(),
    name: text("name").notNull(),
    kind: instrumentKind("kind").notNull(),

    /** 1 for cash equities and indices; derivatives trade in lots (§10). */
    lotSize: integer("lot_size").notNull(),
    /** Smallest permitted price increment, same fixed precision as a price. */
    tickSize: price("tick_size").notNull(),

    /**
     * Whose identifier `vendor_key` is. Stored rather than assumed, because the
     * key format is vendor-specific and a second vendor must not silently
     * inherit the first one's namespace.
     */
    vendor: text("vendor").notNull(),
    /** e.g. Upstox `NSE_EQ|INE002A01018`. Opaque to everything but the loader. */
    vendorKey: text("vendor_key").notNull(),

    /**
     * Survives renames, unlike a ticker. Null for indices, which have no
     * security to identify.
     */
    isin: text("isin"),

    createdAt: timestampTz("created_at").notNull().defaultNow(),
    updatedAt: timestampTz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("instruments_symbol_shape", symbolCheck("symbol")),
    check("instruments_lot_size_positive", sql`${t.lotSize} > 0`),
    check("instruments_tick_size_positive", sql`${t.tickSize} > 0`),
    uniqueIndex("instruments_vendor_key_key").on(t.vendor, t.vendorKey),
  ],
);

/**
 * One daily candle per instrument per session.
 *
 * The CHECK constraints restate `barIssues()` from `src/domain/market-data.ts`
 * in SQL. That duplication is intentional: the validation in the domain guards
 * what the engine reads, and these guard what the loader writes. A high below
 * the close is not a rounding artefact, it is a corrupt row, and a backtest
 * that fills at that high produces a plausible number that is false — so it is
 * rejected at both boundaries rather than at neither.
 *
 * There is no `adjusted` flag per bar, matching the domain: adjustment is a
 * property of the *pull*, and mixing both within one series is how a 1:1 bonus
 * reads as a 50% loss. It is recorded per row only so a partial re-pull cannot
 * silently produce exactly that mix.
 */
export const dailyBars = pgTable(
  "daily_bars",
  {
    symbol: symbol()
      .notNull()
      .references(() => instruments.symbol, { onDelete: "restrict" }),
    /** The IST session date. Not a timestamp — a daily bar is a day, not an instant. */
    date: date("date").notNull(),

    open: price("open").notNull(),
    high: price("high").notNull(),
    low: price("low").notNull(),
    close: price("close").notNull(),
    /** Shares traded. Zero is legal on a thin day; negative is not. */
    volume: bigint("volume", { mode: "number" }).notNull(),

    source: text("source").notNull(),
    adjustment: priceAdjustment("adjustment").notNull(),
    /**
     * The date this row was captured from the vendor. Two runs over the same
     * dates against series pulled six months apart are different runs, and
     * this is what tells them apart (PRD §5.3, reproducible methodology).
     */
    sourceVintage: date("source_vintage").notNull(),
    ingestedAt: timestampTz("ingested_at").notNull().defaultNow(),
  },
  (t) => [
    // Composite key, not a surrogate id: a symbol has exactly one bar per
    // session, and saying so makes a double-load an error rather than a
    // duplicate the engine would later walk twice. It doubles as the range
    // index — every read is "this symbol, these dates" — so there is
    // deliberately no second index on the same two columns.
    uniqueIndex("daily_bars_symbol_date_key").on(t.symbol, t.date),

    check("daily_bars_prices_positive", sql`${t.open} > 0 and ${t.high} > 0 and ${t.low} > 0 and ${t.close} > 0`),
    check("daily_bars_high_is_highest", sql`${t.high} >= ${t.low} and ${t.high} >= ${t.open} and ${t.high} >= ${t.close}`),
    check("daily_bars_low_is_lowest", sql`${t.low} <= ${t.open} and ${t.low} <= ${t.close}`),
    check("daily_bars_volume_not_negative", sql`${t.volume} >= 0`),
  ],
);
