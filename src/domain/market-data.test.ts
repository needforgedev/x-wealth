import { describe, expect, it } from "vitest";

import {
  MarketDataError,
  assertValidSeries,
  barIssues,
  closes,
  seriesIssues,
  type Bar,
} from "./market-data";
import { conformanceViolations } from "./market-data-conformance";
import { NSE_EQUITY_TICK, fixtureSource, flatBars, ohlcBars } from "./market-data-fixture";
import { priceFromString, priceTicks } from "./money";
import { PLACEHOLDER_CALENDAR_2026, WEEKENDS_ONLY } from "./session";
import { toSymbol } from "./symbol";

const RELIANCE = toSymbol("NSE:RELIANCE");

/** 2026-01-05 is a Monday, so a five-bar fixture from it is one clean week. */
const MONDAY = "2026-01-05";

function bar(overrides: Partial<Bar> = {}): Bar {
  return {
    date: MONDAY,
    open: priceFromString("100"),
    high: priceFromString("110"),
    low: priceFromString("90"),
    close: priceFromString("105"),
    volume: 1_000,
    ...overrides,
  };
}

describe("bar validation", () => {
  it("accepts a coherent bar", () => {
    expect(barIssues(bar())).toEqual([]);
  });

  it("rejects a high below the low", () => {
    const issues = barIssues(bar({ high: priceFromString("80"), low: priceFromString("90") }));
    expect(issues.join(" ")).toContain("below low");
  });

  it("rejects a high that does not contain the close", () => {
    // Not pedantry: an engine that fills at this high books a price the
    // instrument never traded at, and the resulting number looks plausible.
    const issues = barIssues(bar({ high: priceFromString("104") }));
    expect(issues.join(" ")).toContain("below the open or close");
  });

  it("rejects a low that does not contain the open", () => {
    const issues = barIssues(bar({ low: priceFromString("101") }));
    expect(issues.join(" ")).toContain("above the open or close");
  });

  it("rejects a non-positive price", () => {
    expect(barIssues(bar({ low: priceTicks(0), open: priceTicks(0) })).join(" ")).toContain(
      "greater than zero",
    );
  });

  it("rejects a negative volume but allows zero", () => {
    expect(barIssues(bar({ volume: -1 })).join(" ")).toContain("volume");
    expect(barIssues(bar({ volume: 0 }))).toEqual([]);
  });
});

describe("series validation", () => {
  const good = flatBars({ from: MONDAY, closes: ["100", "101", "102"] });

  it("accepts an ordered series of trading sessions", () => {
    expect(seriesIssues(good, WEEKENDS_ONLY)).toEqual([]);
  });

  it("rejects a duplicated date", () => {
    const issues = seriesIssues([good[0], good[0]], WEEKENDS_ONLY);
    expect(issues.join(" ")).toContain("duplicated");
  });

  it("rejects bars out of order", () => {
    // The engine reads t-1 for a crossover; reordering silently changes which
    // bar that is, and the backtest still returns a number.
    const issues = seriesIssues([good[2], good[1], good[0]], WEEKENDS_ONLY);
    expect(issues.join(" ")).toContain("out of order");
  });

  it("rejects a bar dated on a day the exchange was shut", () => {
    const saturday = { ...good[0], date: "2026-01-10" };
    expect(seriesIssues([saturday], WEEKENDS_ONLY).join(" ")).toContain("not a trading session");
  });

  it("sees holidays the calendar knows about", () => {
    const republicDay = { ...good[0], date: "2026-01-26" };
    expect(seriesIssues([republicDay], WEEKENDS_ONLY)).toEqual([]);
    expect(seriesIssues([republicDay], PLACEHOLDER_CALENDAR_2026).join(" ")).toContain(
      "not a trading session",
    );
  });

  it("throws with every problem listed, not just the first", () => {
    const broken = [{ ...good[0], high: priceTicks(1) }, good[0]];
    expect(() => assertValidSeries(broken, WEEKENDS_ONLY)).toThrow(MarketDataError);
  });
});

describe("fixture builders", () => {
  it("lays flat bars on consecutive sessions", () => {
    const bars = flatBars({ from: MONDAY, closes: ["100", "101"] });
    expect(bars.map((b) => b.date)).toEqual(["2026-01-05", "2026-01-06"]);
    expect(bars[0].open).toBe(bars[0].close);
    expect(bars[0].high).toBe(bars[0].close);
  });

  it("steps over the weekend", () => {
    const bars = flatBars({ from: MONDAY, closes: ["1", "2", "3", "4", "5", "6", "7"] });
    expect(bars.map((b) => b.date)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-12", // Saturday and Sunday skipped
      "2026-01-13",
    ]);
  });

  it("steps over a holiday when the calendar has one", () => {
    const bars = flatBars({
      from: "2026-01-23", // Friday
      closes: ["1", "2"],
      calendar: PLACEHOLDER_CALENDAR_2026,
    });
    // Sat 24, Sun 25 and Republic Day on Mon 26 are all skipped.
    expect(bars.map((b) => b.date)).toEqual(["2026-01-23", "2026-01-27"]);
  });

  it("refuses to start on a day the exchange was shut", () => {
    expect(() => flatBars({ from: "2026-01-10", closes: ["1"] })).toThrow(MarketDataError);
  });

  it("parses prices as ticks without ever making a float", () => {
    const [only] = flatBars({ from: MONDAY, closes: ["345.50"] });
    expect(only.close).toBe(3_455_000);
  });

  it("builds bars with a real range", () => {
    const [only] = ohlcBars({
      from: MONDAY,
      rows: [{ open: "100", high: "112.25", low: "99.10", close: "108" }],
    });
    expect(only.high).toBe(priceFromString("112.25"));
    expect(only.low).toBe(priceFromString("99.10"));
  });
});

describe("fixture source", () => {
  const series = { "NSE:RELIANCE": flatBars({ from: MONDAY, closes: ["100", "101", "102", "103"] }) };
  const source = fixtureSource({ series });

  it("validates its series at construction, not at read time", () => {
    // A broken fixture should fail where it was written.
    expect(() =>
      fixtureSource({ series: { "NSE:INFY": [bar({ high: priceFromString("1") })] } }),
    ).toThrow(MarketDataError);
  });

  it("rejects an unqualified symbol key", () => {
    expect(() => fixtureSource({ series: { RELIANCE: [] } })).toThrow();
  });

  it("returns bars inclusive of both ends", () => {
    return source.dailyBars(RELIANCE, "2026-01-06", "2026-01-07").then((bars) => {
      expect(bars.map((b) => b.date)).toEqual(["2026-01-06", "2026-01-07"]);
    });
  });

  it("throws on an unknown symbol rather than returning nothing", async () => {
    // An empty array would turn a typo into a zero-trade backtest that reads
    // as a finding.
    await expect(source.dailyBars(toSymbol("NSE:NOSUCH"), MONDAY, "2026-12-31")).rejects.toThrow(
      MarketDataError,
    );
  });

  it("throws on a backwards range", async () => {
    await expect(
      source.dailyBars(RELIANCE, "2026-01-08", "2026-01-05"),
    ).rejects.toThrow(MarketDataError);
  });

  it("reports the latest bar", async () => {
    const latest = await source.latestBar(RELIANCE);
    expect(latest?.date).toBe("2026-01-08");
  });

  it("describes itself for the methodology record", () => {
    const described = fixtureSource({
      series,
      name: "acme-eod",
      adjustment: "UNADJUSTED",
      vintage: "2026-08-20",
    });
    expect(described.metadata).toEqual({
      name: "acme-eod",
      adjustment: "UNADJUSTED",
      calendarName: WEEKENDS_ONLY.name,
      vintage: "2026-08-20",
    });
  });

  it("gives every symbol a cash-equity instrument by default", async () => {
    const [instrument] = await source.instruments();
    expect(instrument.lotSize).toBe(1);
    expect(instrument.tickSize).toBe(NSE_EQUITY_TICK);
    expect(NSE_EQUITY_TICK).toBe(500); // ₹0.05 at four decimal places
  });
});

describe("conformance", () => {
  it("the fixture source satisfies the contract every source must", async () => {
    // The point of the interface is that swapping an implementation cannot
    // change a result. This is the check a real end-of-day source will have to
    // pass before it is allowed anywhere near the engine.
    const source = fixtureSource({
      series: {
        "NSE:RELIANCE": ohlcBars({
          from: MONDAY,
          rows: [
            { open: "100", high: "105", low: "98", close: "104" },
            { open: "104", high: "109", low: "103", close: "107" },
            { open: "107", high: "108", low: "101", close: "102" },
            { open: "102", high: "111", low: "102", close: "110" },
          ],
        }),
      },
    });

    expect(await conformanceViolations(source, { symbol: "NSE:RELIANCE" })).toEqual([]);
  });

  it("catches a source that leaves a symbol out of instruments()", async () => {
    const good = fixtureSource({ series: { "NSE:RELIANCE": flatBars({ from: MONDAY, closes: ["1"] }) } });
    const lying = { ...good, instruments: async () => [] };

    const violations = await conformanceViolations(lying, { symbol: "NSE:RELIANCE" });
    expect(violations.join(" ")).toContain("missing from instruments()");
  });

  it("catches a source whose range end is exclusive", async () => {
    // The most damaging near-miss: every backtest quietly loses its last
    // session, and nothing in the output says so.
    const good = fixtureSource({
      series: { "NSE:RELIANCE": flatBars({ from: MONDAY, closes: ["100", "101", "102"] }) },
    });
    const exclusive = {
      ...good,
      dailyBars: async (symbol: typeof RELIANCE, from: string, to: string) =>
        (await good.dailyBars(symbol, from, to)).filter((b) => b.date < to),
    };

    const violations = await conformanceViolations(exclusive, { symbol: "NSE:RELIANCE" });
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe("reading a series", () => {
  it("extracts closes in order", () => {
    const bars = flatBars({ from: MONDAY, closes: ["100", "101", "102"] });
    expect(closes(bars)).toEqual([1_000_000, 1_010_000, 1_020_000]);
  });
});
