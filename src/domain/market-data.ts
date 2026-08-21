import { type PriceTicks } from "./money";
import { isTradingSession, type IsoDate, type TradingCalendar } from "./session";
import type { Symbol_ } from "./symbol";

/**
 * Where price history comes from.
 *
 * `x-wealth-product.md` §9 blocks on an unresolved legal question: whether a
 * platform serving registered RAs may use real-time price data at all. The
 * instruction that follows from it is the reason this file exists —
 *
 *   > Build the data layer behind an interface so the implementation can swap
 *   > between real-time, delayed, and end-of-day without touching the engine.
 *
 * So the engine takes a `MarketDataSource` and never learns which one it has.
 * Today there is exactly one implementation, the fixture source, and it is
 * enough to build and prove the whole backtest engine: the G4 gate is
 * "hand-calculate 20 trades and assert the engine matches to the paisa", and
 * you cannot hand-calculate against real NSE data. Synthetic series with known
 * answers are not a shortcut here, they are the only way to pass that gate.
 *
 * ## Prices, not money
 *
 * Bars carry `PriceTicks` — fixed-precision integers at four decimal places,
 * the same representation as the `numeric(18,4)` columns. No floats touch a
 * price on the way in (`x-wealth-product.md` §10).
 *
 * ## Reading is asynchronous even though the fixture is not
 *
 * Every real implementation reads a table or a socket. Making the interface
 * async from the start means the engine is written against the shape it will
 * actually have, instead of being rewritten the day a database appears.
 */

export class MarketDataError extends Error {}

/**
 * One daily candle.
 *
 * There is no `adjusted` flag on a bar. Whether prices are corporate-action
 * adjusted is a property of the *source*, declared once in its metadata and
 * recorded in every run's `methodology` — a per-bar flag would let one series
 * mix both, which is how a backtest silently reads a 1:1 bonus as a 50% loss.
 */
export type Bar = {
  readonly date: IsoDate;
  readonly open: PriceTicks;
  readonly high: PriceTicks;
  readonly low: PriceTicks;
  readonly close: PriceTicks;
  /** Shares traded. Integer; zero is legal on a thin day. */
  readonly volume: number;
};

/**
 * Whether the series has been corrected for splits, bonuses and dividends.
 *
 * `execution-plan.md` Track C: "without this every backtest is wrong". A 1:1
 * bonus halves the quoted price overnight, and an unadjusted series reads that
 * as a catastrophic session that never happened.
 *
 * `UNADJUSTED` is deliberately expressible rather than forbidden. Some vendors
 * sell raw series, and `x-wealth-product.md` §10 permits using them provided
 * the run says so: "Backtests must use adjusted data or explicitly document
 * that they don't." This is that documentation, and it travels with the result.
 */
export type PriceAdjustment = "ADJUSTED" | "UNADJUSTED";

/**
 * What a run has to record about where its numbers came from.
 *
 * PRD §5.3 requires methodology "disclosed and reproducible". Reproducible
 * means a reader can tell two runs apart — so the vintage is here. The same
 * strategy over the same dates against a series re-pulled six months later is
 * a different run, because vendors restate history.
 */
export type SourceMetadata = {
  readonly name: string;
  readonly adjustment: PriceAdjustment;
  /** Which trading calendar the source's sessions were determined by. */
  readonly calendarName: string;
  /** The date this data was captured from the vendor. */
  readonly vintage: IsoDate;
};

/** What can be traded, and in what increments. */
export type Instrument = {
  readonly symbol: Symbol_;
  readonly name: string;
  /** 1 for cash equities; derivatives trade in lots (`x-wealth-product.md` §10). */
  readonly lotSize: number;
  /** Smallest permitted price increment — ₹0.05 on most NSE equities. */
  readonly tickSize: PriceTicks;
};

export interface MarketDataSource {
  readonly metadata: SourceMetadata;

  instruments(): Promise<Instrument[]>;

  /**
   * Bars for a symbol, inclusive of both ends, oldest first.
   *
   * Ask for more than the reporting period. An indicator with a 200-session
   * period needs 200 sessions of history before its first usable value, and
   * `backtest_runs.period_start` is the period being *reported*, not the
   * period being *read*.
   *
   * Sessions with no trade are absent rather than zero-filled, so callers must
   * not assume the result is contiguous. An unknown symbol throws — returning
   * an empty array would let a typo produce a zero-trade backtest that looks
   * like a finding.
   */
  dailyBars(symbol: Symbol_, from: IsoDate, to: IsoDate): Promise<Bar[]>;

  /** The most recent bar, or null if the symbol has never traded. */
  latestBar(symbol: Symbol_): Promise<Bar | null>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Everything wrong with a single bar.
 *
 * A high below the close is not a rounding artefact, it is a corrupt row, and
 * a backtest that fills at that high produces a plausible number that is
 * false. Cheaper to reject at the boundary than to explain later.
 */
export function barIssues(bar: Bar): string[] {
  const issues: string[] = [];
  const { date, open, high, low, close, volume } = bar;

  for (const [label, value] of [
    ["open", open],
    ["high", high],
    ["low", low],
    ["close", close],
  ] as const) {
    if (!Number.isInteger(value)) issues.push(`${date}: ${label} is not a whole number of ticks`);
    if (value <= 0) issues.push(`${date}: ${label} must be greater than zero`);
  }

  if (high < low) issues.push(`${date}: high ${high} is below low ${low}`);
  if (high < open || high < close) issues.push(`${date}: high ${high} is below the open or close`);
  if (low > open || low > close) issues.push(`${date}: low ${low} is above the open or close`);

  if (!Number.isInteger(volume) || volume < 0) {
    issues.push(`${date}: volume must be a whole number, not ${volume}`);
  }

  return issues;
}

/**
 * Everything wrong with a series: ordering, duplicates, non-sessions, bad bars.
 *
 * Ordering and uniqueness are load-bearing rather than tidiness. The engine
 * walks bars in order and reads `t-1` for a crossover; a duplicated or
 * out-of-order date silently changes which bar `t-1` is.
 */
export function seriesIssues(bars: readonly Bar[], calendar: TradingCalendar): string[] {
  const issues: string[] = [];
  const seen = new Set<IsoDate>();
  let previous: IsoDate | null = null;

  for (const bar of bars) {
    issues.push(...barIssues(bar));

    if (seen.has(bar.date)) issues.push(`${bar.date}: duplicated`);
    seen.add(bar.date);

    if (previous !== null && bar.date <= previous) {
      issues.push(`${bar.date}: out of order, follows ${previous}`);
    }
    previous = bar.date;

    if (!isTradingSession(bar.date, calendar)) {
      issues.push(`${bar.date}: not a trading session on calendar "${calendar.name}"`);
    }
  }

  return issues;
}

export function assertValidSeries(bars: readonly Bar[], calendar: TradingCalendar): void {
  const issues = seriesIssues(bars, calendar);
  if (issues.length > 0) {
    throw new MarketDataError(`invalid bar series:\n  ${issues.join("\n  ")}`);
  }
}

// ---------------------------------------------------------------------------
// Reading a series
// ---------------------------------------------------------------------------

/**
 * Closing prices, in ticks.
 *
 * The indicators take a plain series rather than bars, so that a change to the
 * bar shape does not ripple into indicator maths that never cared about it.
 */
export function closes(bars: readonly Bar[]): number[] {
  return bars.map((bar) => bar.close);
}

export function dates(bars: readonly Bar[]): IsoDate[] {
  return bars.map((bar) => bar.date);
}
