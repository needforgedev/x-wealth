import { describe, expect, it } from "vitest";

import { conformanceViolations } from "../../domain/market-data-conformance";
import { MarketDataError, isTradeable, type Instrument } from "../../domain/market-data";
import { priceFromString } from "../../domain/money";
import { WEEKENDS_ONLY } from "../../domain/session";
import { toSymbol } from "../../domain/symbol";
import { endOfDaySource, inMemoryStore, type BarRow } from "./eod-source";

/**
 * Rows shaped exactly as `daily_bars` yields them — prices as decimal strings,
 * because `numeric(18,4)` arrives from postgres.js as a string and that is the
 * whole reason it is declared that way (`x-wealth-product.md` §10).
 */
const RELIANCE: BarRow[] = [
  { date: "2026-08-17", open: "1316.00", high: "1322.00", low: "1310.00", close: "1316.00", volume: 13_766_096 },
  { date: "2026-08-18", open: "1316.50", high: "1325.00", low: "1314.00", close: "1322.00", volume: 10_759_956 },
  { date: "2026-08-19", open: "1320.30", high: "1321.60", low: "1305.00", close: "1311.00", volume: 8_061_418 },
  { date: "2026-08-20", open: "1311.00", high: "1318.00", low: "1308.00", close: "1313.20", volume: 6_036_964 },
  { date: "2026-08-21", open: "1313.00", high: "1316.00", low: "1309.00", close: "1312.50", volume: 2_073_848 },
];

const NIFTY: BarRow[] = [
  { date: "2026-08-20", open: "24100.25", high: "24180.10", low: "24050.00", close: "24155.75", volume: 0 },
  { date: "2026-08-21", open: "24155.75", high: "24200.00", low: "24110.00", close: "24188.40", volume: 0 },
];

const INSTRUMENTS: Instrument[] = [
  {
    symbol: toSymbol("NSE:RELIANCE"),
    name: "Reliance Industries",
    kind: "EQUITY",
    lotSize: 1,
    tickSize: priceFromString("0.01"),
  },
  {
    symbol: toSymbol("NSE:NIFTY50"),
    name: "Nifty 50",
    kind: "INDEX",
    lotSize: 1,
    tickSize: priceFromString("0.01"),
  },
];

const source = (overrides: { validateOnRead?: boolean } = {}) =>
  endOfDaySource({
    store: inMemoryStore({
      instruments: INSTRUMENTS,
      rows: { "NSE:RELIANCE": RELIANCE, "NSE:NIFTY50": NIFTY },
    }),
    calendar: WEEKENDS_ONLY,
    adjustment: "ADJUSTED",
    vintage: "2026-08-21",
    name: "upstox-v3",
    ...overrides,
  });

/**
 * The gate this implementation actually has to clear.
 *
 * `plan.md` W3-08: "a conformance suite every implementation must pass, so the
 * engine genuinely cannot tell them apart". The fixture source passes it; if
 * this one does too, then swapping them cannot change a backtest, which is the
 * entire promise made in `x-wealth-product.md` §9.
 */
describe("endOfDaySource conformance", () => {
  it("satisfies the MarketDataSource contract", async () => {
    const violations = await conformanceViolations(source(), {
      symbol: "NSE:RELIANCE",
      calendar: WEEKENDS_ONLY,
    });
    expect(violations).toEqual([]);
  });

  it("satisfies it for an index too", async () => {
    const violations = await conformanceViolations(source(), {
      symbol: "NSE:NIFTY50",
      calendar: WEEKENDS_ONLY,
    });
    expect(violations).toEqual([]);
  });
});

describe("endOfDaySource", () => {
  it("converts decimal strings to ticks without a float in between", async () => {
    const [bar] = await source().dailyBars(toSymbol("NSE:RELIANCE"), "2026-08-19", "2026-08-19");
    expect(bar.open).toBe(priceFromString("1320.30"));
    expect(bar.close).toBe(priceFromString("1311.00"));
    expect(bar.volume).toBe(8_061_418);
  });

  it("includes both ends of the range", async () => {
    const bars = await source().dailyBars(toSymbol("NSE:RELIANCE"), "2026-08-18", "2026-08-20");
    expect(bars.map((b) => b.date)).toEqual(["2026-08-18", "2026-08-19", "2026-08-20"]);
  });

  /**
   * The failure this whole layer is arranged to prevent. A mistyped symbol that
   * returns `[]` produces a backtest with zero trades, which reads as a finding
   * about the strategy rather than as a typo.
   */
  it("throws on an unknown symbol rather than returning nothing", async () => {
    await expect(
      source().dailyBars(toSymbol("NSE:NOSUCHTICKER"), "2026-08-01", "2026-08-21"),
    ).rejects.toThrow(MarketDataError);
  });

  it("throws on a backwards range", async () => {
    await expect(
      source().dailyBars(toSymbol("NSE:RELIANCE"), "2026-08-21", "2026-08-01"),
    ).rejects.toThrow(/backwards/);
  });

  it("returns an empty series — not an error — for a window with no sessions", async () => {
    const bars = await source().dailyBars(toSymbol("NSE:RELIANCE"), "2020-01-01", "2020-01-31");
    expect(bars).toEqual([]);
  });

  it("reports the newest bar as the latest", async () => {
    const latest = await source().latestBar(toSymbol("NSE:RELIANCE"));
    expect(latest?.date).toBe("2026-08-21");
  });

  /**
   * A registered instrument that has not been backfilled is a real, temporary
   * state — the loader inserts instruments before it inserts bars. It must read
   * as "nothing yet", while an unknown symbol still raises.
   */
  it("returns null from latestBar for a known instrument with no bars", async () => {
    const empty = endOfDaySource({
      store: inMemoryStore({ instruments: INSTRUMENTS, rows: {} }),
      calendar: WEEKENDS_ONLY,
      adjustment: "ADJUSTED",
      vintage: "2026-08-21",
    });
    expect(await empty.latestBar(toSymbol("NSE:RELIANCE"))).toBeNull();
    await expect(empty.latestBar(toSymbol("NSE:NOSUCHTICKER"))).rejects.toThrow(MarketDataError);
  });

  it("carries the adjustment and vintage a run has to disclose", async () => {
    // PRD §5.3: methodology disclosed and reproducible. Two runs over the same
    // dates against series pulled months apart are different runs, and the
    // vintage is what tells them apart.
    expect(source().metadata).toEqual({
      name: "upstox-v3",
      adjustment: "ADJUSTED",
      calendarName: "weekends-only",
      vintage: "2026-08-21",
    });
  });

  it("marks an index as not tradeable", async () => {
    const list = await source().instruments();
    const nifty = list.find((i) => i.symbol === "NSE:NIFTY50")!;
    const reliance = list.find((i) => i.symbol === "NSE:RELIANCE")!;

    // You can write a strategy on NIFTY 50; you cannot buy it. The engine must
    // be able to tell, or it will happily "fill" at the spot price.
    expect(isTradeable(nifty)).toBe(false);
    expect(isTradeable(reliance)).toBe(true);
  });

  it("catches a corrupt series when read validation is on", async () => {
    const corrupt = endOfDaySource({
      store: inMemoryStore({
        instruments: INSTRUMENTS,
        rows: {
          // High below the close: not a rounding artefact, a corrupt row. A
          // backtest filling at that high produces a plausible false number.
          "NSE:RELIANCE": [
            { date: "2026-08-21", open: "100.00", high: "101.00", low: "99.00", close: "105.00", volume: 1 },
          ],
        },
      }),
      calendar: WEEKENDS_ONLY,
      adjustment: "ADJUSTED",
      vintage: "2026-08-21",
      validateOnRead: true,
    });

    await expect(
      corrupt.dailyBars(toSymbol("NSE:RELIANCE"), "2026-08-21", "2026-08-21"),
    ).rejects.toThrow(/high/);
  });

  it("reads instruments once and caches them", async () => {
    let calls = 0;
    const counting = endOfDaySource({
      store: {
        async bars() {
          return [];
        },
        async instruments() {
          calls++;
          return INSTRUMENTS;
        },
      },
      calendar: WEEKENDS_ONLY,
      adjustment: "ADJUSTED",
      vintage: "2026-08-21",
    });

    await counting.dailyBars(toSymbol("NSE:RELIANCE"), "2026-08-01", "2026-08-21");
    await counting.dailyBars(toSymbol("NSE:RELIANCE"), "2026-08-01", "2026-08-21");
    await counting.instruments();

    // The universe changes when the loader runs, not during a backtest. A
    // round trip per read would sit in front of the engine's hot loop.
    expect(calls).toBe(1);
  });
});
