import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "../../db";
import { dailyBars, instruments } from "../../db/schema/market-data";
import { priceFromString } from "../../domain/money";
import { PLACEHOLDER_CALENDAR_2026 } from "../../domain/session";
import { toSymbol } from "../../domain/symbol";
import { endOfDaySource, type BarStore } from "./eod-source";
import { UPSTOX_DAILY_ADJUSTMENT, UPSTOX_SOURCE } from "./upstox";

/**
 * The `BarStore` the application actually runs on: `daily_bars` over drizzle.
 *
 * Split from `eod-source.ts` so that file stays importable from a bare `node`
 * process — the loader script needs the conversion helpers but must not drag in
 * a database connection to get them.
 */
export function dbBarStore(): BarStore {
  return {
    async bars(symbol, from, to) {
      const rows = await db()
        .select({
          date: dailyBars.date,
          open: dailyBars.open,
          high: dailyBars.high,
          low: dailyBars.low,
          close: dailyBars.close,
          volume: dailyBars.volume,
        })
        .from(dailyBars)
        .where(and(eq(dailyBars.symbol, symbol), gte(dailyBars.date, from), lte(dailyBars.date, to)))
        // Ordered here, not in memory. The engine reads `t-1` for a crossover,
        // so "oldest first" is a correctness property of the series, and
        // Postgres has the index to do it for free.
        .orderBy(asc(dailyBars.date));

      return rows;
    },

    async instruments() {
      const rows = await db()
        .select({
          symbol: instruments.symbol,
          name: instruments.name,
          kind: instruments.kind,
          lotSize: instruments.lotSize,
          tickSize: instruments.tickSize,
        })
        .from(instruments)
        .orderBy(asc(instruments.symbol));

      return rows.map((row) => ({
        symbol: toSymbol(row.symbol),
        name: row.name,
        kind: row.kind,
        lotSize: row.lotSize,
        tickSize: priceFromString(row.tickSize),
      }));
    },
  };
}

/**
 * The source the engine gets, wired to the live table.
 *
 * `vintage` is read rather than assumed: it is the newest capture date present,
 * so re-running the loader moves it and a run's `methodology` records which
 * pull it saw. A store with no bars has no vintage to report, and asking it
 * for one is a mistake worth surfacing at construction rather than letting a
 * run claim a date it invented.
 */
export async function liveEndOfDaySource(options?: { validateOnRead?: boolean }) {
  const [newest] = await db()
    .select({ vintage: dailyBars.sourceVintage })
    .from(dailyBars)
    .orderBy(desc(dailyBars.sourceVintage))
    .limit(1);

  if (!newest) {
    throw new Error(
      "daily_bars is empty — run `npm run load-market-data` before asking for a source.",
    );
  }

  return endOfDaySource({
    store: dbBarStore(),
    // ⚠️ Still the three-holiday placeholder (W3-05 / blocker B-6). Safe for
    // *reading*, because a series only ever contains sessions the exchange
    // actually held — the calendar cannot invent a bar. It stops being safe the
    // moment anything does session arithmetic on these dates, which is why the
    // real NSE circular is a prerequisite for the forward-test engine, not for
    // this layer.
    calendar: PLACEHOLDER_CALENDAR_2026,
    adjustment: UPSTOX_DAILY_ADJUSTMENT,
    vintage: newest.vintage,
    name: UPSTOX_SOURCE,
    validateOnRead: options?.validateOnRead,
  });
}
