import { describe, expect, it } from "vitest";

import {
  definitionsDiffer,
  describeCondition,
  isEvaluatable,
  requiredWarmUpBars,
  starterDefinition,
  validateStrategyDefinition,
  type InstrumentChoice,
  type StrategyDefinition,
} from "./strategy";

const valid = (overrides: Partial<StrategyDefinition> = {}): StrategyDefinition => ({
  ...starterDefinition(),
  instruments: ["NSE:RELIANCE", "NSE:TCS"],
  ...overrides,
});

const fields = (d: StrategyDefinition) => validateStrategyDefinition(d).map((i) => i.field);

describe("a usable strategy", () => {
  it("passes", () => {
    expect(validateStrategyDefinition(valid())).toEqual([]);
    expect(isEvaluatable(valid())).toBe(true);
  });

  it("does not pass with no instruments — the starter is intentionally incomplete", () => {
    expect(isEvaluatable(starterDefinition())).toBe(false);
    expect(fields(starterDefinition())).toContain("instruments");
  });
});

describe("instruments", () => {
  it("requires exchange qualification", () => {
    expect(fields(valid({ instruments: ["RELIANCE"] }))).toContain("instruments");
  });

  it("rejects duplicates", () => {
    const issues = validateStrategyDefinition(valid({ instruments: ["NSE:TCS", "NSE:TCS"] }));
    expect(issues.some((i) => i.message.includes("twice"))).toBe(true);
  });

  it("rejects an empty list", () => {
    expect(fields(valid({ instruments: [] }))).toContain("instruments");
  });
});

describe("conditions", () => {
  it("rejects a condition whose sides are identical", () => {
    // SMA(20) crossing above SMA(20) can never fire; catching it here beats an
    // empty backtest that looks like a result.
    const issues = validateStrategyDefinition(
      valid({
        entry: {
          left: { kind: "SMA", period: 20 },
          comparator: "CROSSES_ABOVE",
          right: { kind: "SMA", period: 20 },
        },
      }),
    );
    expect(issues.some((i) => i.field === "entry" && i.message.includes("never trigger"))).toBe(true);
  });

  it("rejects comparing two constants", () => {
    const issues = validateStrategyDefinition(
      valid({
        exit: {
          left: { kind: "CONSTANT", value: 10 },
          comparator: "ABOVE",
          right: { kind: "CONSTANT", value: 20 },
        },
      }),
    );
    expect(issues.some((i) => i.field === "exit")).toBe(true);
  });

  it("rejects an out-of-range period", () => {
    expect(
      fields(
        valid({
          entry: {
            left: { kind: "RSI", period: 1 },
            comparator: "BELOW",
            right: { kind: "CONSTANT", value: 30 },
          },
        }),
      ),
    ).toContain("entry.left");
  });

  it("rejects a fractional period", () => {
    expect(
      fields(
        valid({
          entry: {
            left: { kind: "EMA", period: 12.5 },
            comparator: "ABOVE",
            right: { kind: "PRICE" },
          },
        }),
      ),
    ).toContain("entry.left");
  });

  it("accepts an indicator against a constant", () => {
    expect(
      validateStrategyDefinition(
        valid({
          entry: {
            left: { kind: "RSI", period: 14 },
            comparator: "BELOW",
            right: { kind: "CONSTANT", value: 30 },
          },
        }),
      ),
    ).toEqual([]);
  });
});

describe("numeric bounds", () => {
  it("rejects an impossible stop-loss", () => {
    expect(fields(valid({ stopLossPercent: 0 }))).toContain("stopLossPercent");
    expect(fields(valid({ stopLossPercent: 99 }))).toContain("stopLossPercent");
  });

  it("rejects position sizing outside 1–100%", () => {
    expect(fields(valid({ positionSizePercent: 0 }))).toContain("positionSizePercent");
    expect(fields(valid({ positionSizePercent: 250 }))).toContain("positionSizePercent");
  });

  it("insists capital is a whole number of paise", () => {
    // Money is an integer count of paise — never a float (spec §10).
    expect(fields(valid({ initialCapitalPaise: 1234.5 }))).toContain("initialCapitalPaise");
  });

  it("rejects capital below the floor", () => {
    expect(fields(valid({ initialCapitalPaise: 100 }))).toContain("initialCapitalPaise");
  });
});

describe("describeCondition", () => {
  it("reads as a sentence for a reviewer", () => {
    expect(describeCondition(valid().entry)).toBe("SMA(20) crosses above SMA(50)");
    expect(
      describeCondition({
        left: { kind: "RSI", period: 14 },
        comparator: "BELOW",
        right: { kind: "CONSTANT", value: 30 },
      }),
    ).toBe("RSI(14) is below 30");
  });
});

describe("definitionsDiffer", () => {
  it("sees a real change", () => {
    expect(definitionsDiffer(valid(), valid({ stopLossPercent: 3 }))).toBe(true);
  });

  it("ignores instrument ordering", () => {
    // Reordering a list is not a new strategy, and recording it as a new
    // version would pollute the iteration ledger.
    expect(
      definitionsDiffer(
        valid({ instruments: ["NSE:RELIANCE", "NSE:TCS"] }),
        valid({ instruments: ["NSE:TCS", "NSE:RELIANCE"] }),
      ),
    ).toBe(false);
  });

  it("reports no change when nothing changed", () => {
    expect(definitionsDiffer(valid(), valid())).toBe(false);
  });
});

/**
 * The second validation stage: what is true of a definition *here, today*.
 *
 * Shape checks alone let `NSE:FOO` through — it is a perfectly well-formed
 * symbol. The strategy would author cleanly and then fail inside the engine,
 * or worse produce an empty trade log that reads as a finding about the
 * strategy rather than as a typo.
 */
describe("validation against the instrument catalogue", () => {
  const CATALOGUE: InstrumentChoice[] = [
    { symbol: "NSE:RELIANCE", name: "Reliance Industries", tradeable: true, barCount: 1240 },
    { symbol: "NSE:TCS", name: "Tata Consultancy Services", tradeable: true, barCount: 1240 },
    { symbol: "NSE:NIFTY50", name: "Nifty 50", tradeable: false, barCount: 1240 },
    { symbol: "NSE:MIDCPNIFTY", name: "Nifty Midcap Select", tradeable: false, barCount: 1144 },
  ];

  const messages = (d: StrategyDefinition) =>
    validateStrategyDefinition(d, CATALOGUE).map((i) => i.message);

  it("accepts instruments that are loaded and tradeable", () => {
    expect(validateStrategyDefinition(valid(), CATALOGUE)).toEqual([]);
    expect(isEvaluatable(valid(), CATALOGUE)).toBe(true);
  });

  it("rejects a well-formed symbol that has no price history", () => {
    // Passes the shape check; fails the only one that matters.
    expect(validateStrategyDefinition(valid({ instruments: ["NSE:FOO"] }))).toEqual([]);
    expect(messages(valid({ instruments: ["NSE:FOO"] }))).toContainEqual(
      expect.stringContaining("no price history loaded"),
    );
  });

  it("rejects buying an index", () => {
    // NIFTY 50 has a price and nothing to buy. Without this the engine would
    // fill at the spot price — a number that looks entirely ordinary and
    // describes a trade nobody could place.
    expect(messages(valid({ instruments: ["NSE:NIFTY50"] }))).toContainEqual(
      expect.stringContaining("is an index"),
    );
  });

  it("rejects rules that can never warm up on the history available", () => {
    const tooLong = valid({
      instruments: ["NSE:MIDCPNIFTY"],
      entry: {
        left: { kind: "SMA", period: 400 },
        comparator: "CROSSES_ABOVE",
        right: { kind: "SMA", period: 20 },
      },
    });
    // Fails on both counts — index, and 1,144 sessions is plenty for SMA(400),
    // so the warm-up message must not appear here.
    expect(messages(tooLong).some((m) => m.includes("before they produce a first signal"))).toBe(
      false,
    );

    const thin: InstrumentChoice[] = [
      { symbol: "NSE:RELIANCE", name: "Reliance Industries", tradeable: true, barCount: 120 },
    ];
    const issues = validateStrategyDefinition(
      valid({
        instruments: ["NSE:RELIANCE"],
        entry: {
          left: { kind: "SMA", period: 200 },
          comparator: "CROSSES_ABOVE",
          right: { kind: "SMA", period: 20 },
        },
      }),
      thin,
    );
    expect(issues.map((i) => i.message)).toContainEqual(
      expect.stringContaining("before they produce a first signal"),
    );
  });

  it("still checks everything it checked without a catalogue", () => {
    expect(validateStrategyDefinition(valid({ instruments: [] }), CATALOGUE).length).toBeGreaterThan(0);
  });
});

describe("requiredWarmUpBars", () => {
  it("takes the longest period across entry and exit", () => {
    expect(
      requiredWarmUpBars(
        valid({
          entry: {
            left: { kind: "SMA", period: 20 },
            comparator: "CROSSES_ABOVE",
            right: { kind: "SMA", period: 50 },
          },
          exit: {
            left: { kind: "EMA", period: 200 },
            comparator: "CROSSES_BELOW",
            right: { kind: "PRICE" },
          },
        }),
      ),
    ).toBe(200);
  });

  it("gives RSI one extra bar, because it consumes price changes", () => {
    // Both legs overridden: the starter's exit carries an SMA(50), which would
    // otherwise dominate and hide what this is testing.
    expect(
      requiredWarmUpBars(
        valid({
          entry: {
            left: { kind: "RSI", period: 14 },
            comparator: "BELOW",
            right: { kind: "CONSTANT", value: 30 },
          },
          exit: {
            left: { kind: "RSI", period: 14 },
            comparator: "ABOVE",
            right: { kind: "CONSTANT", value: 70 },
          },
        }),
      ),
    ).toBe(15);
  });

  it("is zero for rules built only from price and constants", () => {
    expect(
      requiredWarmUpBars(
        valid({
          entry: { left: { kind: "PRICE" }, comparator: "ABOVE", right: { kind: "CONSTANT", value: 100 } },
          exit: { left: { kind: "PRICE" }, comparator: "BELOW", right: { kind: "CONSTANT", value: 90 } },
        }),
      ),
    ).toBe(0);
  });
});
