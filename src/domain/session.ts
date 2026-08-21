/**
 * Trading sessions, in IST.
 *
 * `x-wealth-product.md` §10: the market runs 09:15–15:30 IST, Monday to Friday,
 * excluding exchange holidays. **There is no 24-hour market**, and every piece
 * of date arithmetic in the forward-test engine has to respect that or it will
 * fill trades on days the exchange was shut.
 *
 * IST is UTC+05:30 year-round — India observes no daylight saving — so the
 * offset is a constant rather than a timezone lookup.
 *
 * Dates are `YYYY-MM-DD` strings interpreted as IST calendar days. All internal
 * arithmetic runs on UTC-midnight instants and never touches a local-time
 * method, so the result does not depend on where the process is running.
 */

export const IST_OFFSET_MINUTES = 5 * 60 + 30;

export const MARKET_OPEN_IST = { hour: 9, minute: 15 } as const;
export const MARKET_CLOSE_IST = { hour: 15, minute: 30 } as const;

export type IsoDate = string; // YYYY-MM-DD

/**
 * The set of dates the exchange is closed, beyond weekends.
 *
 * This is data, not logic — it comes from the NSE holiday circular, changes
 * every year, and includes lunar-calendar festivals that cannot be computed.
 */
export type TradingCalendar = {
  readonly name: string;
  readonly holidays: ReadonlySet<IsoDate>;

  /**
   * Weekend dates the exchange nonetheless traded on.
   *
   * Not a curiosity — NSE and BSE hold several a year, and each one is a real
   * session with real prices. Diwali Muhurat trading falls on whatever day
   * Diwali does, including Sunday; the Union Budget is traded on the 1st of
   * February whether or not it is a weekend; and the exchanges run occasional
   * Saturday sessions to test their disaster-recovery site.
   *
   * A calendar without this rejects genuine bars. That is not theoretical: the
   * first backfill of the six-instrument universe surfaced six such dates
   * between 2023 and 2026, and `assertValidSeries` refused all of it.
   */
  readonly specialSessions?: ReadonlySet<IsoDate>;
};

export class SessionError extends Error {}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/**
 * ⚠️ INCOMPLETE — three fixed-date national holidays only.
 *
 * The real NSE list has ~15 entries a year, most of them lunar-calendar
 * festivals whose dates are published annually and cannot be derived. Replace
 * this with the official circular before any backtest or forward test is run
 * for real — see W3-05 and blocker B-6. It exists so the code has something to
 * exercise, and is named so nobody mistakes it for authoritative.
 */
export const PLACEHOLDER_CALENDAR_2026: TradingCalendar = {
  name: "placeholder-2026-incomplete",
  holidays: new Set<IsoDate>([
    "2026-01-26", // Republic Day
    "2026-08-15", // Independence Day
    "2026-10-02", // Gandhi Jayanti
  ]),

  /**
   * These, unlike the holidays above, are not guesses.
   *
   * Every one was observed as a real bar in Upstox's series for the loaded
   * universe — the exchange printed prices, so the session happened. Kept as
   * evidence rather than as a placeholder; the official circular will add to
   * this list, not correct it.
   */
  specialSessions: new Set<IsoDate>([
    "2023-11-12", // Sunday — Diwali Muhurat trading
    "2024-01-20", // Saturday — special live session, disaster-recovery test
    "2024-03-02", // Saturday — special live session, disaster-recovery test
    "2024-05-18", // Saturday — special live session, disaster-recovery test
    "2025-02-01", // Saturday — Union Budget
    "2026-02-01", // Sunday — Union Budget
  ]),
};

/** Weekends only — useful in tests and as an explicit "no holidays" case. */
export const WEEKENDS_ONLY: TradingCalendar = {
  name: "weekends-only",
  holidays: new Set<IsoDate>(),
};

// ---------------------------------------------------------------------------
// Date helpers — UTC-midnight instants, never local time
// ---------------------------------------------------------------------------

function assertIsoDate(date: string): void {
  if (!DATE_PATTERN.test(date)) {
    throw new SessionError(`expected a YYYY-MM-DD date, got "${date}"`);
  }
  if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new SessionError(`not a real date: "${date}"`);
  }
}

function toUtcMidnight(date: IsoDate): number {
  assertIsoDate(date);
  return Date.parse(`${date}T00:00:00Z`);
}

function toIsoDate(msUtcMidnight: number): IsoDate {
  return new Date(msUtcMidnight).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, in IST. */
export function dayOfWeek(date: IsoDate): number {
  return new Date(toUtcMidnight(date)).getUTCDay();
}

export function isWeekend(date: IsoDate): boolean {
  const day = dayOfWeek(date);
  return day === 0 || day === 6;
}

export function isHoliday(date: IsoDate, calendar: TradingCalendar): boolean {
  assertIsoDate(date);
  return calendar.holidays.has(date);
}

/**
 * A special session wins over both the weekend rule and the holiday list.
 *
 * The exchange either traded that day or it did not, and a date the exchange
 * traded is a session however the general rules would classify it.
 */
export function isTradingSession(date: IsoDate, calendar: TradingCalendar): boolean {
  assertIsoDate(date);
  if (calendar.specialSessions?.has(date)) return true;
  return !isWeekend(date) && !isHoliday(date, calendar);
}

// ---------------------------------------------------------------------------
// Session arithmetic
// ---------------------------------------------------------------------------

/** Guards against an unbounded search if a calendar is ever pathological. */
const MAX_SCAN_DAYS = 400;

export function nextSession(date: IsoDate, calendar: TradingCalendar): IsoDate {
  let ms = toUtcMidnight(date);
  for (let i = 0; i < MAX_SCAN_DAYS; i++) {
    ms += DAY_MS;
    const candidate = toIsoDate(ms);
    if (isTradingSession(candidate, calendar)) return candidate;
  }
  throw new SessionError(`no trading session within ${MAX_SCAN_DAYS} days after ${date}`);
}

export function previousSession(date: IsoDate, calendar: TradingCalendar): IsoDate {
  let ms = toUtcMidnight(date);
  for (let i = 0; i < MAX_SCAN_DAYS; i++) {
    ms -= DAY_MS;
    const candidate = toIsoDate(ms);
    if (isTradingSession(candidate, calendar)) return candidate;
  }
  throw new SessionError(`no trading session within ${MAX_SCAN_DAYS} days before ${date}`);
}

/**
 * Move `count` sessions from `date`.
 *
 * `count` of 0 returns `date` itself if it is a session, and throws if it is
 * not — "zero sessions from a Sunday" has no sensible answer and guessing one
 * is how an off-by-one gets into a test window.
 */
export function addSessions(date: IsoDate, count: number, calendar: TradingCalendar): IsoDate {
  if (!Number.isInteger(count)) {
    throw new SessionError(`session count must be a whole number, got ${count}`);
  }
  if (count === 0) {
    if (!isTradingSession(date, calendar)) {
      throw new SessionError(`${date} is not a trading session, so "0 sessions from it" is undefined`);
    }
    return date;
  }

  let current = date;
  const step = count > 0 ? nextSession : previousSession;
  for (let i = 0; i < Math.abs(count); i++) current = step(current, calendar);
  return current;
}

/**
 * Trading sessions in the half-open range (from, to] — i.e. how many sessions
 * `addSessions(from, n)` would need to reach `to`.
 *
 * Half-open because the natural question is "how many sessions has this test
 * run for", and the day it started is session zero, not session one.
 */
export function sessionsBetween(
  from: IsoDate,
  to: IsoDate,
  calendar: TradingCalendar,
): number {
  const start = toUtcMidnight(from);
  const end = toUtcMidnight(to);
  if (end < start) return -sessionsBetween(to, from, calendar);

  let count = 0;
  for (let ms = start + DAY_MS; ms <= end; ms += DAY_MS) {
    if (isTradingSession(toIsoDate(ms), calendar)) count++;
  }
  return count;
}

/** Every session in the inclusive range. */
export function sessionsInRange(
  from: IsoDate,
  to: IsoDate,
  calendar: TradingCalendar,
): IsoDate[] {
  const start = toUtcMidnight(from);
  const end = toUtcMidnight(to);
  if (end < start) throw new SessionError(`range is backwards: ${from} to ${to}`);

  const out: IsoDate[] = [];
  for (let ms = start; ms <= end; ms += DAY_MS) {
    const date = toIsoDate(ms);
    if (isTradingSession(date, calendar)) out.push(date);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Intraday
// ---------------------------------------------------------------------------

/** The UTC instants bounding a session's trading window. */
export function marketWindow(date: IsoDate): { open: Date; close: Date } {
  const midnight = toUtcMidnight(date);
  const minutesToMs = (h: number, m: number) => (h * 60 + m - IST_OFFSET_MINUTES) * 60_000;
  return {
    open: new Date(midnight + minutesToMs(MARKET_OPEN_IST.hour, MARKET_OPEN_IST.minute)),
    close: new Date(midnight + minutesToMs(MARKET_CLOSE_IST.hour, MARKET_CLOSE_IST.minute)),
  };
}

/** The IST calendar date an instant falls on. */
export function istDateOf(instant: Date): IsoDate {
  return new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/**
 * Is the exchange open at this instant?
 *
 * Inclusive of the open, exclusive of the close — a fill stamped exactly at
 * 15:30:00 belongs to the closing auction, not to continuous trading, and the
 * engine must not treat it as a normal in-session fill.
 */
export function isMarketOpen(instant: Date, calendar: TradingCalendar): boolean {
  const date = istDateOf(instant);
  if (!isTradingSession(date, calendar)) return false;
  const { open, close } = marketWindow(date);
  return instant.getTime() >= open.getTime() && instant.getTime() < close.getTime();
}
