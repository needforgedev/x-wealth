import {
  MarketDataError,
  assertValidSeries,
  type Bar,
  type Instrument,
  type MarketDataSource,
  type PriceAdjustment,
  type SourceMetadata,
} from "./market-data";
import { priceFromString, type PriceTicks } from "./money";
import {
  WEEKENDS_ONLY,
  isTradingSession,
  nextSession,
  type IsoDate,
  type TradingCalendar,
} from "./session";
import { toSymbol, type Symbol_ } from "./symbol";

/**
 * A `MarketDataSource` built from hand-authored candles.
 *
 * This is not a stand-in until the real thing arrives — it is the only source
 * against which the engine can be *proved*. Gate G4 asks for twenty trades
 * hand-calculated and matched to the paisa, and nobody hand-calculates against
 * five years of NSE ticks. A series where you already know the answer is the
 * instrument that makes that gate passable.
 *
 * It also has no vendor, no cost, no network call and no dependency on the
 * unresolved legal question in `x-wealth-product.md` §9, so the engine can be
 * built and finished before any of that is settled.
 *
 * Prices are written as rupee decimal strings — `"345.50"` — and parsed by
 * `priceFromString`, so a fixture never constructs a float. The strings are
 * also what a reader checks the arithmetic against.
 */

const DEFAULT_CALENDAR = WEEKENDS_ONLY;

/** ₹0.05, the tick on most NSE cash equities. */
export const NSE_EQUITY_TICK: PriceTicks = priceFromString("0.05");

function sessionsFrom(from: IsoDate, count: number, calendar: TradingCalendar): IsoDate[] {
  if (!isTradingSession(from, calendar)) {
    throw new MarketDataError(
      `fixture starts on ${from}, which is not a trading session on "${calendar.name}"`,
    );
  }
  const out: IsoDate[] = [];
  let current = from;
  for (let i = 0; i < count; i++) {
    out.push(current);
    if (i < count - 1) current = nextSession(current, calendar);
  }
  return out;
}

/**
 * Bars where open, high, low and close are all the same.
 *
 * Degenerate on purpose. An indicator reads closes and nothing else, so a
 * fixture for one should not require inventing three other numbers that then
 * have to be checked for coherence. Use `ohlcBars` wherever the range matters
 * — a stop-loss test, for instance, where the low is the whole point.
 */
export function flatBars(input: {
  from: IsoDate;
  closes: readonly string[];
  calendar?: TradingCalendar;
  volume?: number;
}): Bar[] {
  const calendar = input.calendar ?? DEFAULT_CALENDAR;
  const volume = input.volume ?? 1_000;
  const days = sessionsFrom(input.from, input.closes.length, calendar);

  return input.closes.map((close, index) => {
    const price = priceFromString(close);
    return { date: days[index], open: price, high: price, low: price, close: price, volume };
  });
}

export type OhlcRow = {
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: number;
};

/** Bars with a real range, for anything that reads the high or the low. */
export function ohlcBars(input: {
  from: IsoDate;
  rows: readonly OhlcRow[];
  calendar?: TradingCalendar;
}): Bar[] {
  const calendar = input.calendar ?? DEFAULT_CALENDAR;
  const days = sessionsFrom(input.from, input.rows.length, calendar);

  return input.rows.map((row, index) => ({
    date: days[index],
    open: priceFromString(row.open),
    high: priceFromString(row.high),
    low: priceFromString(row.low),
    close: priceFromString(row.close),
    volume: row.volume ?? 1_000,
  }));
}

export type FixtureInput = {
  /** Bars per exchange-qualified symbol. Validated on construction. */
  series: Record<string, readonly Bar[]>;
  name?: string;
  adjustment?: PriceAdjustment;
  calendar?: TradingCalendar;
  vintage?: IsoDate;
  /** Overrides per symbol; anything omitted gets a cash-equity default. */
  instruments?: Record<string, Partial<Omit<Instrument, "symbol">>>;
};

/**
 * Build a source from a map of symbol to bars.
 *
 * Series are validated once, here, rather than on every read: a fixture with
 * an out-of-order date or a high below its close is a broken test, and it
 * should fail where it was written instead of somewhere inside the engine.
 */
export function fixtureSource(input: FixtureInput): MarketDataSource {
  const calendar = input.calendar ?? DEFAULT_CALENDAR;

  const metadata: SourceMetadata = {
    name: input.name ?? "fixture",
    // Fixtures are authored, not pulled, so there is nothing to adjust and
    // nothing to correct for. Saying ADJUSTED asserts the series is already
    // continuous, which for hand-written candles it is by construction.
    adjustment: input.adjustment ?? "ADJUSTED",
    calendarName: calendar.name,
    vintage: input.vintage ?? "1970-01-01",
  };

  const series = new Map<string, readonly Bar[]>();
  const instruments: Instrument[] = [];

  for (const [raw, bars] of Object.entries(input.series)) {
    const symbol = toSymbol(raw);
    assertValidSeries(bars, calendar);
    series.set(symbol, bars);

    const overrides = input.instruments?.[raw] ?? {};
    instruments.push({
      symbol,
      name: overrides.name ?? symbol,
      kind: overrides.kind ?? "EQUITY",
      lotSize: overrides.lotSize ?? 1,
      tickSize: overrides.tickSize ?? NSE_EQUITY_TICK,
    });
  }

  function barsFor(symbol: Symbol_): readonly Bar[] {
    const bars = series.get(symbol);
    if (!bars) {
      // Not an empty array. A typo that returns nothing produces a zero-trade
      // backtest, which reads as a result rather than as a mistake.
      throw new MarketDataError(`fixture has no series for ${symbol}`);
    }
    return bars;
  }

  return {
    metadata,

    async instruments() {
      return [...instruments];
    },

    async dailyBars(symbol, from, to) {
      if (to < from) throw new MarketDataError(`range is backwards: ${from} to ${to}`);
      return barsFor(symbol).filter((bar) => bar.date >= from && bar.date <= to);
    },

    async latestBar(symbol) {
      const bars = barsFor(symbol);
      return bars.length === 0 ? null : bars[bars.length - 1];
    },
  };
}
