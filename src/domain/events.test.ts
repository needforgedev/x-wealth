import { describe, expect, it } from "vitest";

import {
  entryBarredByEvents,
  isExpiryDay,
  monthlyExpiry,
  mustFlattenBeforeEvents,
  sizeMultiplierForSession,
  type MarketEvent,
} from "./events";
import { WEEKENDS_ONLY, type TradingCalendar } from "./session";

const event = (overrides: Partial<MarketEvent>): MarketEvent => ({
  eventType: "EARNINGS",
  symbol: "NSE:TCS",
  eventDate: "2026-01-15",
  knownOn: "2026-01-02",
  confirmed: true,
  ...overrides,
});

const base = {
  symbol: "NSE:TCS",
  types: ["EARNINGS"] as const,
  calendar: WEEKENDS_ONLY,
};

describe("monthlyExpiry", () => {
  it("is the last Thursday of the month", () => {
    expect(monthlyExpiry("2026-01-05", WEEKENDS_ONLY)).toBe("2026-01-29");
    expect(monthlyExpiry("2026-09-01", WEEKENDS_ONLY)).toBe("2026-09-24");
  });

  it("rolls back to the previous session when that Thursday does not trade", () => {
    const withHoliday: TradingCalendar = {
      name: "test",
      holidays: new Set(["2026-01-29"]),
    };
    expect(monthlyExpiry("2026-01-05", withHoliday)).toBe("2026-01-28");
  });

  it("isExpiryDay is true on exactly that session", () => {
    expect(isExpiryDay("2026-01-29", WEEKENDS_ONLY)).toBe(true);
    expect(isExpiryDay("2026-01-28", WEEKENDS_ONLY)).toBe(false);
    // A Saturday is not a session, whatever the arithmetic says.
    expect(isExpiryDay("2026-01-31", WEEKENDS_ONLY)).toBe(false);
  });
});

describe("entryBarredByEvents", () => {
  it("bars entry on the event day and inside the window, in sessions not days", () => {
    const events = [event({ eventDate: "2026-01-19" })]; // a Monday
    // Friday the 16th is one *session* before Monday the 19th.
    expect(
      entryBarredByEvents({ ...base, session: "2026-01-16", daysBefore: 1, events }),
    ).toBe(true);
    expect(
      entryBarredByEvents({ ...base, session: "2026-01-19", daysBefore: 0, events }),
    ).toBe(true);
    // Two sessions out with a one-session window: clear to enter.
    expect(
      entryBarredByEvents({ ...base, session: "2026-01-15", daysBefore: 1, events }),
    ).toBe(false);
  });

  it("ignores an event the session could not yet know about — the lookahead guard", () => {
    // Announced on the 12th. On the 9th the date was not public, and a rule
    // reacting to it would have read the future (W16-04).
    const events = [event({ eventDate: "2026-01-14", knownOn: "2026-01-12" })];
    expect(
      entryBarredByEvents({ ...base, session: "2026-01-09", daysBefore: 5, events }),
    ).toBe(false);
    expect(
      entryBarredByEvents({ ...base, session: "2026-01-13", daysBefore: 5, events }),
    ).toBe(true);
  });

  it("ignores unconfirmed dates unless the caller opts in", () => {
    const events = [event({ confirmed: false, eventDate: "2026-01-15" })];
    const at = { ...base, session: "2026-01-14", daysBefore: 2, events };
    expect(entryBarredByEvents(at)).toBe(false);
  });

  it("scopes by symbol, and market-wide events reach every symbol", () => {
    const events = [
      event({ symbol: "NSE:RELIANCE", eventDate: "2026-01-15" }),
      event({ eventType: "RBI_POLICY", symbol: null, eventDate: "2026-01-21" }),
    ];
    expect(
      entryBarredByEvents({ ...base, session: "2026-01-14", daysBefore: 2, events }),
    ).toBe(false);
    expect(
      entryBarredByEvents({
        ...base,
        types: ["RBI_POLICY"],
        session: "2026-01-20",
        daysBefore: 1,
        events,
      }),
    ).toBe(true);
  });
});

describe("mustFlattenBeforeEvents", () => {
  it("fires on exactly the last session before the event", () => {
    const events = [event({ eventDate: "2026-01-19" })]; // Monday
    expect(mustFlattenBeforeEvents({ ...base, session: "2026-01-16", events })).toBe(true);
    expect(mustFlattenBeforeEvents({ ...base, session: "2026-01-15", events })).toBe(false);
    expect(mustFlattenBeforeEvents({ ...base, session: "2026-01-19", events })).toBe(false);
  });

  it("respects the knownOn guard like every other primitive", () => {
    const events = [event({ eventDate: "2026-01-19", knownOn: "2026-01-19" })];
    expect(mustFlattenBeforeEvents({ ...base, session: "2026-01-16", events })).toBe(false);
  });
});

describe("sizeMultiplierForSession", () => {
  it("applies the factor inside the window and exactly 1 outside it", () => {
    const events = [event({ eventDate: "2026-01-15" })];
    const common = { ...base, daysBefore: 1, multiplier: 0.5, events };
    expect(sizeMultiplierForSession({ ...common, session: "2026-01-14" })).toBe(0.5);
    expect(sizeMultiplierForSession({ ...common, session: "2026-01-12" })).toBe(1);
  });
});
