/**
 * Market events as rule primitives. `plan.md` W16, `CLAUDE.md` §7.4.
 *
 * **Not a news feed** (W16-05). An event here is a dated fact a rule can
 * reference — an expiry, an earnings date, a policy announcement — never
 * content to read. There is no headline field and no text field, and that is
 * the design, not an omission.
 *
 * ## The `knownOn` discipline (W16-04)
 *
 * Earnings dates get revised, and a backtest that skips entries around a date
 * that was only announced later has quietly read the future. Every event
 * therefore carries `knownOn` — the session by which the date was public —
 * and every evaluator in this module takes the current session and ignores
 * events not yet known on it. Confirmed exchange facts (expiries, holidays,
 * record dates) are known from listing; soft dates are known from when the
 * row says they were.
 *
 * ## Exchange holidays are not rows
 *
 * The calendar module already owns them, generated from printed bars. A
 * second copy in a table would be a second truth (the `W6-13` argument, one
 * layer down). Expiry days are likewise computed from the calendar rather
 * than stored — they are arithmetic, and arithmetic stored is arithmetic
 * that can drift.
 */
import {
  isTradingSession,
  previousSession,
  type IsoDate,
  type TradingCalendar,
} from "./session";

/** §7.4's list, minus holidays (calendar) and expiries (computed). */
export const MARKET_EVENT_TYPES = [
  "EARNINGS",
  "EX_DIVIDEND",
  "SPLIT",
  "BONUS",
  "RBI_POLICY",
  "BUDGET",
  "CPI_IIP",
] as const;
export type MarketEventType = (typeof MARKET_EVENT_TYPES)[number];

/** Event types that concern one instrument. The rest are market-wide. */
export const SYMBOL_SCOPED_TYPES: readonly MarketEventType[] = [
  "EARNINGS",
  "EX_DIVIDEND",
  "SPLIT",
  "BONUS",
];

/** One dated fact, as the engine sees it. */
export type MarketEvent = {
  readonly eventType: MarketEventType;
  /** Null for market-wide events (RBI_POLICY, BUDGET, CPI_IIP). */
  readonly symbol: string | null;
  readonly eventDate: IsoDate;
  /** The session by which this date was public. See the module note. */
  readonly knownOn: IsoDate;
  /** False while the date is provisional and may move (W16-04). */
  readonly confirmed: boolean;
  /**
   * When this row entered *our* table — set by the forward-test path, absent
   * for backtests. A forward window is replayed nightly and diffed against an
   * append-only ledger, so an event backfilled mid-window with an old
   * `knownOn` must not rewrite sessions already evaluated: the replay sees a
   * row only from the session it was recorded, whatever the market knew.
   * Backtests use `knownOn` alone — historical honesty rather than replay
   * stability, which is the right trade in each direction.
   */
  readonly recordedOn?: IsoDate;
};

// ---------------------------------------------------------------------------
// Expiry arithmetic — computed, never stored
// ---------------------------------------------------------------------------

/**
 * The monthly F&O expiry for the month containing `date`: the last Thursday,
 * rolled back to the previous session when that Thursday does not trade.
 * NSE's own rule, applied to whatever calendar is passed in.
 */
export function monthlyExpiry(date: IsoDate, calendar: TradingCalendar): IsoDate {
  const [year, month] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
  // Walk back from the last day of the month to its final Thursday.
  const last = new Date(Date.UTC(year, month, 0));
  while (last.getUTCDay() !== 4) last.setUTCDate(last.getUTCDate() - 1);

  let expiry = last.toISOString().slice(0, 10);
  if (!isTradingSession(expiry, calendar)) expiry = previousSession(expiry, calendar);
  return expiry;
}

export function isExpiryDay(date: IsoDate, calendar: TradingCalendar): boolean {
  return isTradingSession(date, calendar) && monthlyExpiry(date, calendar) === date;
}

// ---------------------------------------------------------------------------
// The four primitives (§7.4), evaluated per session
// ---------------------------------------------------------------------------

/** Sessions between `from` and `to` inclusive of neither end, by calendar. */
function sessionsUntil(from: IsoDate, to: IsoDate, calendar: TradingCalendar, cap: number): number {
  if (to <= from) return Number.NEGATIVE_INFINITY;
  let cursor = to;
  let count = 0;
  while (cursor > from && count <= cap) {
    cursor = previousSession(cursor, calendar);
    count++;
  }
  return cursor === from ? count : Number.POSITIVE_INFINITY;
}

/**
 * Events of the given types relevant to `symbol` on `session`, honestly:
 * only those already public (`knownOn <= session`), and only confirmed ones
 * unless the caller opts into soft dates.
 */
function relevantEvents(input: {
  events: readonly MarketEvent[];
  types: readonly MarketEventType[];
  symbol: string;
  session: IsoDate;
  includeUnconfirmed?: boolean;
}): MarketEvent[] {
  return input.events.filter(
    (e) =>
      input.types.includes(e.eventType) &&
      (e.symbol === null || e.symbol === input.symbol) &&
      e.knownOn <= input.session &&
      (e.recordedOn === undefined || e.recordedOn <= input.session) &&
      (e.confirmed || input.includeUnconfirmed === true),
  );
}

/** `skip_entries_within(daysBefore, types)` — true when entry is barred today. */
export function entryBarredByEvents(input: {
  session: IsoDate;
  symbol: string;
  daysBefore: number;
  types: readonly MarketEventType[];
  events: readonly MarketEvent[];
  calendar: TradingCalendar;
}): boolean {
  return relevantEvents({ ...input, types: input.types }).some((e) => {
    if (e.eventDate === input.session) return true;
    const distance = sessionsUntil(input.session, e.eventDate, input.calendar, input.daysBefore);
    return distance <= input.daysBefore;
  });
}

/** `flatten_positions_before(types)` — true when a position must close today. */
export function mustFlattenBeforeEvents(input: {
  session: IsoDate;
  symbol: string;
  types: readonly MarketEventType[];
  events: readonly MarketEvent[];
  calendar: TradingCalendar;
}): boolean {
  // "Before" means the last session prior to the event, resolved by calendar.
  return relevantEvents({ ...input, types: input.types }).some(
    (e) => e.eventDate > input.session && previousSession(e.eventDate, input.calendar) === input.session,
  );
}

/** `size_multiplier_during(window, multiplier)` — the factor in force today. */
export function sizeMultiplierForSession(input: {
  session: IsoDate;
  symbol: string;
  daysBefore: number;
  multiplier: number;
  types: readonly MarketEventType[];
  events: readonly MarketEvent[];
  calendar: TradingCalendar;
}): number {
  const inWindow = entryBarredByEvents(input);
  return inWindow ? input.multiplier : 1;
}
