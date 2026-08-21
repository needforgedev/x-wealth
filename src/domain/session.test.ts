import { describe, expect, it } from "vitest";

import {
  PLACEHOLDER_CALENDAR_2026,
  SessionError,
  WEEKENDS_ONLY,
  addSessions,
  isMarketOpen,
  isTradingSession,
  isWeekend,
  istDateOf,
  marketWindow,
  nextSession,
  previousSession,
  sessionsBetween,
  sessionsInRange,
  type IsoDate,
  type TradingCalendar,
} from "./session";

/** A small, explicit calendar so the tests do not depend on placeholder data. */
const CAL: TradingCalendar = {
  name: "test",
  holidays: new Set(["2026-08-19", "2026-08-20"]), // a Wednesday and Thursday
};

describe("weekends", () => {
  it("knows Saturday and Sunday", () => {
    expect(isWeekend("2026-08-22")).toBe(true); // Saturday
    expect(isWeekend("2026-08-23")).toBe(true); // Sunday
    expect(isWeekend("2026-08-21")).toBe(false); // Friday
  });
});

describe("sessions", () => {
  it("excludes weekends and holidays", () => {
    expect(isTradingSession("2026-08-18", CAL)).toBe(true); // Tuesday
    expect(isTradingSession("2026-08-19", CAL)).toBe(false); // holiday
    expect(isTradingSession("2026-08-22", CAL)).toBe(false); // Saturday
  });

  it("steps over a holiday run", () => {
    // Tue 18th -> next session skips Wed/Thu holidays -> Fri 21st
    expect(nextSession("2026-08-18", CAL)).toBe("2026-08-21");
  });

  it("steps over a weekend", () => {
    expect(nextSession("2026-08-21", CAL)).toBe("2026-08-24"); // Fri -> Mon
    expect(previousSession("2026-08-24", CAL)).toBe("2026-08-21"); // Mon -> Fri
  });

  it("walks backwards over the same gaps", () => {
    expect(previousSession("2026-08-21", CAL)).toBe("2026-08-18");
  });
});

describe("addSessions", () => {
  it("counts forward", () => {
    expect(addSessions("2026-08-18", 1, CAL)).toBe("2026-08-21");
    expect(addSessions("2026-08-18", 2, CAL)).toBe("2026-08-24");
    expect(addSessions("2026-08-18", 3, CAL)).toBe("2026-08-25");
  });

  it("counts backward", () => {
    expect(addSessions("2026-08-25", -3, CAL)).toBe("2026-08-18");
  });

  it("round-trips", () => {
    expect(addSessions(addSessions("2026-08-18", 40, CAL), -40, CAL)).toBe("2026-08-18");
  });

  it("returns the same day for zero, but only from a real session", () => {
    expect(addSessions("2026-08-18", 0, CAL)).toBe("2026-08-18");
    // Guessing an answer for "0 sessions from a Sunday" is how off-by-ones
    // get into a test window.
    expect(() => addSessions("2026-08-23", 0, CAL)).toThrow(SessionError);
  });

  it("rejects a fractional count", () => {
    expect(() => addSessions("2026-08-18", 1.5, CAL)).toThrow(SessionError);
  });

  it("spans a 60-session window without drifting", () => {
    const start = "2026-01-01";
    const end = addSessions(start, 60, PLACEHOLDER_CALENDAR_2026);
    expect(sessionsBetween(start, end, PLACEHOLDER_CALENDAR_2026)).toBe(60);
  });
});

describe("sessionsBetween", () => {
  it("is half-open — the start day is session zero", () => {
    expect(sessionsBetween("2026-08-18", "2026-08-18", CAL)).toBe(0);
    expect(sessionsBetween("2026-08-18", "2026-08-21", CAL)).toBe(1);
    expect(sessionsBetween("2026-08-18", "2026-08-24", CAL)).toBe(2);
  });

  it("is symmetric under reversal", () => {
    expect(sessionsBetween("2026-08-24", "2026-08-18", CAL)).toBe(-2);
  });

  it("agrees with addSessions", () => {
    const to = addSessions("2026-03-02", 25, PLACEHOLDER_CALENDAR_2026);
    expect(sessionsBetween("2026-03-02", to, PLACEHOLDER_CALENDAR_2026)).toBe(25);
  });

  it("counts a plain week as five sessions", () => {
    expect(sessionsBetween("2026-08-24", "2026-08-31", WEEKENDS_ONLY)).toBe(5);
  });
});

describe("sessionsInRange", () => {
  it("lists sessions inclusively", () => {
    expect(sessionsInRange("2026-08-17", "2026-08-24", CAL)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-21",
      "2026-08-24",
    ]);
  });

  it("rejects a backwards range", () => {
    expect(() => sessionsInRange("2026-08-24", "2026-08-17", CAL)).toThrow(SessionError);
  });
});

describe("market window", () => {
  it("opens 09:15 IST and closes 15:30 IST, expressed in UTC", () => {
    const { open, close } = marketWindow("2026-08-18");
    expect(open.toISOString()).toBe("2026-08-18T03:45:00.000Z");
    expect(close.toISOString()).toBe("2026-08-18T10:00:00.000Z");
  });

  it("maps an instant back to its IST calendar day", () => {
    // 20:00 UTC is past midnight in IST, so it belongs to the next IST day.
    expect(istDateOf(new Date("2026-08-18T20:00:00Z"))).toBe("2026-08-19");
    expect(istDateOf(new Date("2026-08-18T03:45:00Z"))).toBe("2026-08-18");
  });
});

describe("isMarketOpen", () => {
  it("is open during the session", () => {
    expect(isMarketOpen(new Date("2026-08-18T05:00:00Z"), CAL)).toBe(true); // 10:30 IST
  });

  it("is shut before the open and at/after the close", () => {
    expect(isMarketOpen(new Date("2026-08-18T03:44:59Z"), CAL)).toBe(false);
    // 15:30:00 exactly belongs to the closing auction, not continuous trading.
    expect(isMarketOpen(new Date("2026-08-18T10:00:00Z"), CAL)).toBe(false);
    expect(isMarketOpen(new Date("2026-08-18T09:59:59Z"), CAL)).toBe(true);
  });

  it("is shut all day on a holiday and at the weekend", () => {
    expect(isMarketOpen(new Date("2026-08-19T05:00:00Z"), CAL)).toBe(false); // holiday
    expect(isMarketOpen(new Date("2026-08-22T05:00:00Z"), CAL)).toBe(false); // Saturday
  });

  it("does not depend on the machine's timezone", () => {
    // The engine must behave identically wherever it runs; everything here is
    // computed from UTC instants, never from local-time methods.
    const instant = new Date("2026-08-18T05:00:00Z");
    expect(isMarketOpen(instant, CAL)).toBe(true);
    expect(istDateOf(instant)).toBe("2026-08-18");
  });
});

describe("input validation", () => {
  it("rejects malformed and impossible dates", () => {
    for (const bad of ["18-08-2026", "2026/08/18", "2026-8-18", "not-a-date", "2026-13-01"]) {
      expect(() => isTradingSession(bad, CAL), bad).toThrow(SessionError);
    }
  });
});

describe("the placeholder calendar", () => {
  it("is flagged as incomplete so nobody ships it by accident", () => {
    expect(PLACEHOLDER_CALENDAR_2026.name).toContain("incomplete");
    // The real NSE list is ~15 days a year. If this ever looks complete,
    // it should be renamed and this test updated deliberately.
    expect(PLACEHOLDER_CALENDAR_2026.holidays.size).toBeLessThan(10);
  });
});

/**
 * Weekend sessions the exchange actually held.
 *
 * Found the hard way: the first backfill of real Upstox data was rejected
 * wholesale because six genuine sessions between 2023 and 2026 fell on a
 * Saturday or Sunday. A calendar that cannot express them cannot describe the
 * Indian market.
 */
describe("special sessions", () => {
  const budgetSaturday: TradingCalendar = {
    name: "with-budget-day",
    holidays: new Set<IsoDate>(),
    specialSessions: new Set<IsoDate>(["2025-02-01"]),
  };

  it("treats a listed weekend date as a session", () => {
    expect(isWeekend("2025-02-01")).toBe(true);
    expect(isTradingSession("2025-02-01", budgetSaturday)).toBe(true);
    // The Saturday either side stays closed.
    expect(isTradingSession("2025-02-08", budgetSaturday)).toBe(false);
  });

  it("leaves an ordinary calendar unchanged when there are none", () => {
    expect(isTradingSession("2025-02-01", WEEKENDS_ONLY)).toBe(false);
  });

  it("wins over the holiday list", () => {
    // The exchange either traded that day or it did not. If it did, no general
    // rule outranks that.
    const conflicted: TradingCalendar = {
      name: "conflicted",
      holidays: new Set<IsoDate>(["2025-02-01"]),
      specialSessions: new Set<IsoDate>(["2025-02-01"]),
    };
    expect(isTradingSession("2025-02-01", conflicted)).toBe(true);
  });

  it("counts in session arithmetic, not just in the predicate", () => {
    // The bug this guards: a forward test's 60-session window silently running
    // a session long because the walk skipped a day the exchange traded.
    expect(nextSession("2025-01-31", budgetSaturday)).toBe("2025-02-01");
    expect(previousSession("2025-02-03", budgetSaturday)).toBe("2025-02-01");
    expect(sessionsInRange("2025-01-31", "2025-02-03", budgetSaturday)).toEqual([
      "2025-01-31",
      "2025-02-01",
      "2025-02-03",
    ]);
  });

  it("carries the six sessions observed in the loaded universe", () => {
    for (const date of ["2023-11-12", "2024-01-20", "2024-03-02", "2024-05-18", "2025-02-01", "2026-02-01"]) {
      expect(isWeekend(date)).toBe(true);
      expect(isTradingSession(date, PLACEHOLDER_CALENDAR_2026)).toBe(true);
    }
  });
});
