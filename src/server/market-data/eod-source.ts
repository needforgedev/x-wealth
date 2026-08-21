import {
  MarketDataError,
  assertValidSeries,
  type Bar,
  type Instrument,
  type MarketDataSource,
  type PriceAdjustment,
  type SourceMetadata,
} from "../../domain/market-data";
import { priceFromString } from "../../domain/money";
import type { IsoDate, TradingCalendar } from "../../domain/session";
import { toSymbol, type Symbol_ } from "../../domain/symbol";

/**
 * End-of-day bars, served from our own table.
 *
 * `plan.md` W3-02 calls this "always legal, always our floor", and the floor
 * part is the point: whatever the answer to the real-time question in
 * `x-wealth-product.md` §9 turns out to be, this implementation stays valid.
 * The engine takes a `MarketDataSource` and never learns which one it has.
 *
 * ## Why it reads a table rather than the vendor
 *
 * Three reasons, in order of how much they matter.
 *
 * A backtest must be reproducible. Re-running one against a live endpoint
 * re-pulls whatever the vendor holds *today*, so the same strategy over the
 * same dates can quietly return a different number — which is exactly what
 * `backtest_runs.methodology` and its vintage exist to prevent.
 *
 * The vendor caps a request at one decade and rejects anything wider outright.
 * A source that fetched on demand would have to chunk mid-read and would fail
 * in the middle of a run rather than during a load.
 *
 * And it keeps redistribution exposure to a single ingest path — still the open
 * question in Track C, and much easier to reason about when only the loader
 * talks to the vendor at all.
 */

/**
 * A row as it comes out of `daily_bars`.
 *
 * Prices are decimal strings, not numbers. `numeric(18,4)` arrives from
 * postgres.js as a string precisely so it does not pass through a double on the
 * way, and `priceFromString` is the only sanctioned way to turn one into ticks
 * (`x-wealth-product.md` §10). A driver configured to parse numerics into
 * numbers would silently undo that, so this type refuses to accept one.
 */
export type BarRow = {
  date: IsoDate;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
};

/**
 * Everything this source needs from storage.
 *
 * An interface rather than a drizzle query, so the conformance suite can run
 * against an in-memory store with no database at all. `plan.md` W3-08 wants the
 * suite runnable "from anywhere — including against a live database in CI", and
 * that is only true if the thing under test is not welded to a connection.
 */
export type BarStore = {
  /** Inclusive of both ends, oldest first. Empty if the symbol has no bars. */
  bars(symbol: Symbol_, from: IsoDate, to: IsoDate): Promise<BarRow[]>;
  instruments(): Promise<Instrument[]>;
};

export type EndOfDayOptions = {
  store: BarStore;
  calendar: TradingCalendar;
  adjustment: PriceAdjustment;
  /** The date this data was captured. Recorded in every run's methodology. */
  vintage: IsoDate;
  name?: string;
  /**
   * Validate every series on read.
   *
   * Off by default — the loader validates on write and the table has CHECKs
   * restating the same rules, so a third pass on every read of a five-year
   * series is cost without information. Worth turning on in CI, or the first
   * time a result looks wrong and you want to rule the data out.
   */
  validateOnRead?: boolean;
};

/** Widest range the interface can be asked for, used by `latestBar`. */
const WIDE_FROM: IsoDate = "1900-01-01";
const WIDE_TO: IsoDate = "2999-12-31";

export function endOfDaySource(options: EndOfDayOptions): MarketDataSource {
  const metadata: SourceMetadata = {
    name: options.name ?? "end-of-day",
    adjustment: options.adjustment,
    calendarName: options.calendar.name,
    vintage: options.vintage,
  };

  let known: Promise<Map<Symbol_, Instrument>> | null = null;

  /**
   * Cached for the life of the source.
   *
   * The universe changes when someone runs the loader, not during a backtest,
   * and `dailyBars` consults it on every call to tell "no bars in this window"
   * apart from "no such instrument". Re-querying per call would put a round
   * trip in front of every read in the engine's hot loop.
   */
  function instrumentIndex(): Promise<Map<Symbol_, Instrument>> {
    known ??= options.store
      .instruments()
      .then((list) => new Map(list.map((i) => [i.symbol, i])));
    return known;
  }

  async function assertKnown(symbol: Symbol_): Promise<void> {
    const index = await instrumentIndex();
    if (!index.has(symbol)) {
      // Not an empty array. A typo that returns nothing produces a zero-trade
      // backtest, which reads as a finding rather than as a mistake.
      throw new MarketDataError(`${symbol} is not a loaded instrument`);
    }
  }

  async function read(symbol: Symbol_, from: IsoDate, to: IsoDate): Promise<Bar[]> {
    const rows = await options.store.bars(symbol, from, to);
    const bars = rows.map(toBar);
    if (options.validateOnRead) assertValidSeries(bars, options.calendar);
    return bars;
  }

  return {
    metadata,

    async instruments() {
      return [...(await instrumentIndex()).values()];
    },

    async dailyBars(symbol, from, to) {
      if (to < from) throw new MarketDataError(`range is backwards: ${from} to ${to}`);
      await assertKnown(symbol);
      return read(symbol, from, to);
    },

    async latestBar(symbol) {
      await assertKnown(symbol);
      // A known instrument with no bars yet is a legitimate null — it has been
      // registered but not backfilled. Only an *unknown* symbol throws.
      const bars = await read(symbol, WIDE_FROM, WIDE_TO);
      return bars.length === 0 ? null : bars[bars.length - 1];
    },
  };
}

function toBar(row: BarRow): Bar {
  return {
    date: row.date,
    open: priceFromString(row.open),
    high: priceFromString(row.high),
    low: priceFromString(row.low),
    close: priceFromString(row.close),
    volume: row.volume,
  };
}

/**
 * An in-memory `BarStore`, for tests and for running the conformance suite
 * without a database.
 *
 * It is not a second implementation of the source — the source above is the
 * only one, and this only stands in for the table underneath it. That is what
 * makes a conformance run against this meaningful: everything being tested is
 * the real code path.
 */
export function inMemoryStore(input: {
  instruments: readonly Instrument[];
  rows: Record<string, readonly BarRow[]>;
}): BarStore {
  const byInstrument = new Map<Symbol_, readonly BarRow[]>();
  for (const [raw, rows] of Object.entries(input.rows)) {
    byInstrument.set(toSymbol(raw), [...rows].sort((a, b) => (a.date < b.date ? -1 : 1)));
  }

  return {
    async bars(symbol, from, to) {
      const rows = byInstrument.get(symbol) ?? [];
      return rows.filter((r) => r.date >= from && r.date <= to);
    },
    async instruments() {
      return [...input.instruments];
    },
  };
}
