/**
 * Trading sessions, in IST.
 *
 * `CLAUDE.md` §12: the market runs 09:15–15:30 IST, Monday to Friday,
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
 * The years this calendar actually covers.
 *
 * Exported because the gap matters: outside this range every holiday reads as
 * an ordinary trading day, and session arithmetic is silently wrong rather than
 * loudly absent. Daily bars go back to 2000, so a backtest over 2015 is using a
 * weekday rule and nothing more. Extending it is a matter of adding the years
 * from the circular — see the note on `NSE_CALENDAR`.
 */
export const NSE_CALENDAR_COVERS = { from: "2023-01-01", to: "2026-12-31" } as const;

/**
 * NSE trading holidays, 2023–2026.
 *
 * Sourced from the exchange holiday circular as republished by Zerodha, Groww
 * and CalendarLabs, cross-checked across sources per year — 2026 agreed across
 * three. This is data, not logic: it changes every year, most of it is
 * lunar-calendar festivals whose dates cannot be derived, and the only correct
 * way to extend it is to read the next circular.
 *
 * ## Diwali Laxmi Pujan is a session, not a holiday
 *
 * The trap this calendar is most likely to spring. Laxmi Pujan is a gazetted
 * trading holiday — normal trading does not open — but the exchange runs the
 * ~1-hour Muhurat session that evening, so **prices print and a daily bar
 * exists**. Listing it as a holiday and stopping there would make
 * `assertValidSeries` reject a genuine bar on four dates in this range.
 *
 * Each one is therefore listed in `holidays` *and* in `specialSessions`, which
 * wins. That is deliberate rather than redundant: the pair records both facts —
 * the exchange was closed for normal trading, and it nonetheless traded — where
 * omitting it from `holidays` would record only the second.
 *
 * ## What is verified against bars and what is not
 *
 * The six weekend sessions below were found in Upstox's own series for the
 * loaded universe: the exchange printed prices, so the session happened. The
 * holiday dates and the three weekday Muhurat dates are documentary — taken
 * from the circular, not yet confirmed against bars, because the database has
 * been unreachable since early September. **Re-run `npm run load-market-data`
 * once it is back**: `assertValidSeries` will reject any bar landing on a date
 * this file calls closed, which is exactly the check that would catch an error
 * here.
 */
export const NSE_CALENDAR: TradingCalendar = {
  name: "nse-2023-2026",
  holidays: new Set<IsoDate>([
    // --- 2023 ---------------------------------------------------------------
    "2023-01-26", // Republic Day
    "2023-03-07", // Holi
    "2023-03-30", // Ram Navami
    "2023-04-04", // Mahavir Jayanti
    "2023-04-07", // Good Friday
    "2023-04-14", // Dr. Baba Saheb Ambedkar Jayanti
    "2023-04-21", // Id-ul-Fitr
    "2023-05-01", // Maharashtra Day
    "2023-06-28", // Bakri Id
    "2023-08-15", // Independence Day
    "2023-09-19", // Ganesh Chaturthi
    "2023-10-02", // Mahatma Gandhi Jayanti
    "2023-10-24", // Dasara
    "2023-11-12", // Diwali-Laxmi Pujan — Muhurat session, see above
    "2023-11-14", // Diwali-Balipratipada
    "2023-11-27", // Guru Nanak Jayanti
    "2023-12-25", // Christmas

    // --- 2024 ---------------------------------------------------------------
    "2024-01-26", // Republic Day
    "2024-03-08", // Maha Shivaratri
    "2024-03-25", // Holi
    "2024-03-29", // Good Friday
    "2024-04-10", // Id-ul-Fitr
    "2024-04-14", // Dr. Baba Saheb Ambedkar Jayanti
    "2024-04-17", // Ram Navami
    "2024-04-21", // Mahavir Jayanti
    "2024-05-01", // Maharashtra Day
    "2024-06-17", // Bakri Id
    "2024-07-17", // Muharram
    "2024-08-15", // Independence Day
    "2024-09-07", // Ganesh Chaturthi
    "2024-10-02", // Mahatma Gandhi Jayanti
    "2024-10-13", // Dasara
    "2024-11-01", // Diwali-Laxmi Pujan — Muhurat session, see above
    "2024-11-02", // Diwali-Balipratipada
    "2024-11-15", // Guru Nanak Jayanti
    "2024-12-25", // Christmas

    // --- 2025 ---------------------------------------------------------------
    "2025-01-26", // Republic Day
    "2025-02-26", // Maha Shivaratri
    "2025-03-14", // Holi
    "2025-03-31", // Id-ul-Fitr
    "2025-04-06", // Ram Navami
    "2025-04-10", // Mahavir Jayanti
    "2025-04-14", // Dr. Baba Saheb Ambedkar Jayanti
    "2025-04-18", // Good Friday
    "2025-05-01", // Maharashtra Day
    "2025-06-07", // Bakri Id
    "2025-07-06", // Muharram
    "2025-08-15", // Independence Day
    "2025-08-27", // Ganesh Chaturthi
    "2025-10-02", // Dasara and Mahatma Gandhi Jayanti
    "2025-10-21", // Diwali-Laxmi Pujan — Muhurat session, see above
    "2025-10-22", // Diwali-Balipratipada
    "2025-11-05", // Guru Nanak Jayanti
    "2025-12-25", // Christmas

    // --- 2026 ---------------------------------------------------------------
    // The election holiday is late-announced and state-specific: two of the
    // three sources carry it, the third predates the announcement. Kept,
    // because a spurious holiday costs a session and a missing one corrupts
    // the count in the direction that flatters.
    "2026-01-15", // Municipal Corporation General Elections, Maharashtra
    "2026-01-26", // Republic Day
    "2026-03-03", // Holi
    "2026-03-26", // Shri Ram Navami
    "2026-03-31", // Shri Mahavir Jayanti
    "2026-04-03", // Good Friday
    "2026-04-14", // Dr. Baba Saheb Ambedkar Jayanti
    "2026-05-01", // Maharashtra Day
    "2026-05-28", // Bakri Id
    "2026-06-26", // Muharram
    "2026-09-14", // Ganesh Chaturthi
    "2026-10-02", // Mahatma Gandhi Jayanti
    "2026-10-20", // Dussehra
    "2026-11-08", // Diwali-Laxmi Pujan — Muhurat session, see above
    "2026-11-10", // Diwali-Balipratipada
    "2026-11-24", // Prakash Gurpurb Sri Guru Nanak Dev
    "2026-12-25", // Christmas
  ]),

  /**
   * Dates the exchange traded that the general rules would call closed.
   *
   * The six weekend entries were each observed as a real bar in Upstox's series
   * for the loaded universe. The four Muhurat entries are from the circular and
   * override their own holiday listing above.
   */
  specialSessions: new Set<IsoDate>([
    "2023-11-12", // Sunday — Diwali Muhurat trading
    "2024-01-20", // Saturday — special live session, disaster-recovery test
    "2024-03-02", // Saturday — special live session, disaster-recovery test
    "2024-05-18", // Saturday — special live session, disaster-recovery test
    "2024-11-01", // Friday — Diwali Muhurat trading
    "2025-02-01", // Saturday — Union Budget
    "2025-10-21", // Tuesday — Diwali Muhurat trading
    "2026-02-01", // Sunday — Union Budget
    "2026-11-08", // Sunday — Diwali Muhurat trading
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
