import { describe, expect, it } from "vitest";

import {
  definitionsDiffer,
  describeCondition,
  isEvaluatable,
  starterDefinition,
  validateStrategyDefinition,
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
