import { describe, expect, it } from "vitest";

import {
  curatedMacroEvents,
  eventKey,
  selectFreshEvents,
  type LoadableEvent,
} from "./events";
import { MARKET_EVENT_TYPES } from "@/domain/events";

const ev = (o: Partial<LoadableEvent>): LoadableEvent => ({
  eventType: "EX_DIVIDEND",
  symbol: "NSE:TCS",
  eventDate: "2026-10-15",
  knownOn: "2026-09-20",
  confirmed: true,
  source: "test",
  ...o,
});

describe("selectFreshEvents", () => {
  it("inserts nothing when every event is already present — re-run is a no-op", () => {
    const events = [ev({}), ev({ eventType: "BONUS", eventDate: "2026-11-01" })];
    const keys = new Set(events.map(eventKey));
    expect(selectFreshEvents(events, keys)).toEqual([]);
  });

  it("treats a revised date as a new row, not a duplicate (W16-04)", () => {
    const original = ev({ eventDate: "2026-10-15", knownOn: "2026-09-20" });
    const revised = ev({ eventDate: "2026-10-17", knownOn: "2026-09-25" });
    // The original is on file; the revision has a later knownOn, so it is fresh.
    const fresh = selectFreshEvents([original, revised], new Set([eventKey(original)]));
    expect(fresh).toEqual([revised]);
  });

  it("dedupes within a single batch", () => {
    const one = ev({});
    expect(selectFreshEvents([one, ev({}), one], new Set())).toHaveLength(1);
  });

  it("source and provenance do not affect identity — same fact, one row", () => {
    const a = ev({ source: "indianapi:corporate_actions" });
    const b = ev({ source: "manual" });
    // Same type/symbol/date/knownOn/confirmed → same key → the second is skipped.
    expect(selectFreshEvents([a, b], new Set())).toHaveLength(1);
  });
});

describe("curatedMacroEvents", () => {
  it("is market-wide, confirmed, and known well before each event", async () => {
    const events = await curatedMacroEvents().fetch();
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.symbol).toBeNull(); // macro events name no instrument
      expect(e.confirmed).toBe(true);
      expect(e.knownOn < e.eventDate).toBe(true); // published ahead of time
      expect(MARKET_EVENT_TYPES).toContain(e.eventType);
      expect(e.source).toMatch(/^circular:/);
    }
  });
});
