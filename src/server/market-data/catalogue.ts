import { asc, count, eq, max, min, sql } from "drizzle-orm";

import { db } from "../../db";
import { dailyBars, instruments } from "../../db/schema/market-data";
import type { InstrumentChoice } from "../../domain/strategy";
import type { IsoDate } from "../../domain/session";

/**
 * What an advisor may build a strategy on, right now.
 *
 * The builder used to take a free-text symbol and accept anything
 * exchange-shaped. `NSE:FOO` passed — it is a perfectly well-formed symbol —
 * and the strategy would save cleanly, then fail inside the engine, or worse
 * produce an empty trade log that reads as a finding about the strategy rather
 * than as a typo. This is the list that replaces guessing.
 *
 * Deliberately derived from `daily_bars` rather than from `instruments` alone.
 * A registered instrument with no bars is a real, temporary state — the loader
 * writes the instrument row before it writes any history — and it is not
 * something anyone can backtest against.
 */
export type CatalogueEntry = InstrumentChoice & {
  kind: "EQUITY" | "INDEX";
  firstSession: IsoDate;
  lastSession: IsoDate;
};

export async function loadCatalogue(): Promise<CatalogueEntry[]> {
  const rows = await db()
    .select({
      symbol: instruments.symbol,
      name: instruments.name,
      kind: instruments.kind,
      barCount: count(dailyBars.date),
      firstSession: min(dailyBars.date),
      lastSession: max(dailyBars.date),
    })
    .from(instruments)
    .innerJoin(dailyBars, eq(dailyBars.symbol, instruments.symbol))
    .groupBy(instruments.symbol, instruments.name, instruments.kind)
    // Tradeable first, then alphabetically. An advisor opening the builder is
    // looking for something to buy, and the indices — useful as operands later,
    // useless as trade targets today — should not lead the list.
    .orderBy(sql`case when ${instruments.kind} = 'EQUITY' then 0 else 1 end`, asc(instruments.name));

  return rows.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    kind: row.kind,
    // A spot index has a price and nothing to buy. `daily_bars` happily holds
    // NIFTY 50; that does not make it purchasable.
    tradeable: row.kind !== "INDEX",
    barCount: row.barCount,
    firstSession: row.firstSession ?? "",
    lastSession: row.lastSession ?? "",
  }));
}
