import { describe, expect, it } from "vitest";

import {
  COMPILE_JSON_SCHEMA,
  COMPILE_SYSTEM_PROMPT,
  REVISE_SYSTEM_PROMPT,
  buildCompileInput,
  compileDefinition,
  definitionRows,
  diffDefinitions,
  type CompileOutput,
  type DefinitionDraft,
} from "./compile";
import { validateStrategyDefinition, type InstrumentChoice } from "./strategy";

const CATALOGUE: InstrumentChoice[] = [
  { symbol: "NSE:RELIANCE", name: "Reliance Industries", tradeable: true, barCount: 900 },
  { symbol: "NSE:TCS", name: "Tata Consultancy Services", tradeable: true, barCount: 900 },
  { symbol: "NSE:NIFTY50", name: "Nifty 50", tradeable: false, barCount: 900 },
];

const GOOD_DRAFT: DefinitionDraft = {
  instruments: ["NSE:RELIANCE"],
  minAvgTurnoverPaise: 50_000_000_000,
  timeframe: "1d",
  entry: {
    left: { kind: "RSI", period: 14 },
    comparator: "BELOW",
    right: { kind: "CONSTANT", value: 30 },
  },
  exit: {
    left: { kind: "RSI", period: 14 },
    comparator: "ABOVE",
    right: { kind: "CONSTANT", value: 60 },
  },
  stopLossPercent: 5,
  targetPercent: 20,
  sizingKind: "RISK_PERCENT",
  riskPercent: 1,
  capitalPercent: null,
  maxConcurrentPositions: 5,
  maxExposurePercent: 50,
  initialCapitalPaise: 10_000_000,
};

const compiled = (definition: DefinitionDraft): CompileOutput => ({
  kind: "COMPILE",
  status: "COMPILED",
  definition,
  assumptions: ["Capital left at the default ₹1,00,000."],
  summary: "Buys Reliance when RSI(14) falls below 30.",
});

describe("compiling an idea into a definition", () => {
  it("produces a definition the real validator accepts", () => {
    const result = compileDefinition(compiled(GOOD_DRAFT), CATALOGUE);
    expect(result.status).toBe("COMPILED");
    if (result.status !== "COMPILED") return;

    // All six mandatory components (§7.3), present because the type requires them.
    expect(result.definition.universe.instruments).toEqual(["NSE:RELIANCE"]);
    expect(result.definition.universe.minAvgTurnoverPaise).toBe(50_000_000_000);
    expect(result.definition.entry.comparator).toBe("BELOW");
    expect(result.definition.exit.comparator).toBe("ABOVE");
    expect(result.definition.stopLossPercent).toBe(5);
    expect(result.definition.sizing).toEqual({ kind: "RISK_PERCENT", riskPercent: 1 });
    expect(result.definition.timeframe).toBe("1d");

    // And the definition stands on its own terms, not on this module's say-so.
    expect(validateStrategyDefinition(result.definition, CATALOGUE)).toEqual([]);
  });

  /**
   * The guarantee that matters most. If the compiler could produce something
   * the authoring form would have rejected, it would be a route around the six
   * mandatory components rather than a route to them — and the CHECK constraint
   * would be the only thing left standing between a model and the database.
   */
  it("cannot produce a strategy the authoring form would reject", () => {
    const cases: Array<[string, Partial<DefinitionDraft>]> = [
      ["a stop wider than the bounds allow", { stopLossPercent: 90 }],
      ["a stop of zero", { stopLossPercent: 0 }],
      ["an instrument that does not exist", { instruments: ["NSE:NOTLISTED"] }],
      ["an index that cannot be bought", { instruments: ["NSE:NIFTY50"] }],
      ["no instruments at all", { instruments: [] }],
      ["an indicator period beyond the limit", {
        entry: { left: { kind: "RSI", period: 5_000 }, comparator: "BELOW", right: { kind: "CONSTANT", value: 30 } },
      }],
      ["risk sizing beyond the limit", { riskPercent: 80 }],
      ["more concurrent positions than allowed", { maxConcurrentPositions: 500 }],
      ["capital below the floor", { initialCapitalPaise: 1 }],
    ];

    for (const [label, patch] of cases) {
      const result = compileDefinition(compiled({ ...GOOD_DRAFT, ...patch }), CATALOGUE);
      expect(result.status, label).toBe("REJECTED");
    }
  });

  /**
   * The flat operand shape exists so structured output works across models, and
   * it makes combinations sayable that `Operand` does not allow. Each must be
   * refused rather than repaired: a silently dropped period produces a strategy
   * that runs and is not the one described.
   */
  it("refuses operand shapes the flattening makes expressible", () => {
    const bad: Array<[string, DefinitionDraft["entry"]]> = [
      ["PRICE carrying a period", {
        left: { kind: "PRICE", period: 14 }, comparator: "BELOW", right: { kind: "CONSTANT", value: 30 },
      }],
      ["an indicator with no period", {
        left: { kind: "RSI" }, comparator: "BELOW", right: { kind: "CONSTANT", value: 30 },
      }],
      ["a constant with no value", {
        left: { kind: "RSI", period: 14 }, comparator: "BELOW", right: { kind: "CONSTANT" },
      }],
      ["an operand kind the engine has never heard of", {
        left: { kind: "MACD", period: 12 }, comparator: "BELOW", right: { kind: "CONSTANT", value: 30 },
      }],
      ["a comparator the engine has never heard of", {
        left: { kind: "PRICE" }, comparator: "TOUCHES", right: { kind: "CONSTANT", value: 30 },
      }],
    ];

    for (const [label, entry] of bad) {
      const result = compileDefinition(compiled({ ...GOOD_DRAFT, entry }), CATALOGUE);
      expect(result.status, label).toBe("REJECTED");
    }
  });

  it("refuses sizing that names a kind without its number", () => {
    for (const patch of [
      { sizingKind: "RISK_PERCENT", riskPercent: null },
      { sizingKind: "CAPITAL_PERCENT", capitalPercent: null },
      { sizingKind: "BY_CONVICTION" },
    ] as Array<Partial<DefinitionDraft>>) {
      expect(compileDefinition(compiled({ ...GOOD_DRAFT, ...patch }), CATALOGUE).status).toBe("REJECTED");
    }
  });
});

describe("when the idea is incomplete", () => {
  it("asks rather than inventing the missing component", () => {
    const result = compileDefinition(
      {
        kind: "COMPILE",
        status: "NEEDS_INPUT",
        questions: [
          { id: "stop", question: "Where does the stop go?", options: ["2%", "5%"], because: "You did not say." },
        ],
      },
      CATALOGUE,
    );
    expect(result.status).toBe("NEEDS_INPUT");
    if (result.status !== "NEEDS_INPUT") return;
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].because).not.toBe("");
  });

  it("treats an empty question list as a failure, not as agreement", () => {
    const result = compileDefinition({ kind: "COMPILE", status: "NEEDS_INPUT", questions: [] }, CATALOGUE);
    expect(result.status).toBe("REJECTED");
  });

  it("refuses COMPILED with nothing compiled", () => {
    const result = compileDefinition({ kind: "COMPILE", status: "COMPILED" }, CATALOGUE);
    expect(result.status).toBe("REJECTED");
  });

  it("refuses a status it does not recognise", () => {
    const result = compileDefinition({ kind: "COMPILE", status: "PROBABLY_FINE" }, CATALOGUE);
    expect(result.status).toBe("REJECTED");
  });
});

describe("what the model is shown", () => {
  const input = buildCompileInput({
    idea: "Buy Reliance when RSI drops under 30",
    catalogue: CATALOGUE,
    defaultCapitalPaise: 10_000_000,
  });

  /**
   * `input_snapshot` is retained for as long as the strategy record is, which
   * is forever. PII stays out of it on the same terms as logs and errors.
   */
  it("carries no PII and no price data", () => {
    const serialised = JSON.stringify(input);
    for (const forbidden of ["phone", "email", "dob", "pan", "ohlc", "close", "volume"]) {
      expect(serialised.toLowerCase(), forbidden).not.toContain(`"${forbidden}"`);
    }
  });

  it("offers only tradeable instruments, by symbol and name alone", () => {
    const catalogue = (input as { catalogue: Array<Record<string, unknown>> }).catalogue;
    expect(catalogue.map((c) => c.symbol)).toEqual(["NSE:RELIANCE", "NSE:TCS"]);
    // barCount would invite the model to prefer instruments with more history,
    // which is a data-driven choice and therefore §7.2's problem.
    for (const entry of catalogue) expect(Object.keys(entry).sort()).toEqual(["name", "symbol"]);
  });

  it("tells the model not to form a view or scan data", () => {
    expect(COMPILE_SYSTEM_PROMPT).toContain("Never form a view on a security");
    expect(COMPILE_SYSTEM_PROMPT).toContain("no market data");
    expect(COMPILE_SYSTEM_PROMPT).toContain("NEEDS_INPUT");
  });
});

describe("the output contract", () => {
  /**
   * §7.11 forbids prose, and the schema is how that is enforced rather than
   * requested. `strict` is what makes the provider reject a response that adds
   * a field, which is the usual way a verdict arrives.
   */
  it("is strict and closed", () => {
    expect(COMPILE_JSON_SCHEMA.strict).toBe(true);
    expect(COMPILE_JSON_SCHEMA.schema.additionalProperties).toBe(false);
  });

  /**
   * §8.7 — no platform-authored grade, in any field, ever. The schema is closed,
   * so a field that does not exist here cannot be returned at all. Asserted by
   * walking the whole object rather than by naming the properties, so a nested
   * addition is caught too.
   */
  it("gives a verdict nowhere to live", () => {
    const keys: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          keys.push(k.toLowerCase());
          walk(v);
        }
      }
    };
    walk(COMPILE_JSON_SCHEMA);
    for (const banned of ["score", "grade", "rating", "rank", "verdict", "quality", "confidence"]) {
      expect(keys, banned).not.toContain(banned);
    }
  });

  /**
   * §7.3 — structured data, never code. Matched on word boundaries because
   * "description" contains "script", which is how the first version of this
   * test failed on its own schema.
   */
  it("never asks for code", () => {
    const serialised = JSON.stringify(COMPILE_JSON_SCHEMA).toLowerCase();
    for (const banned of ["pine", "pinescript", "python", "javascript", "source code", "snippet"]) {
      expect(serialised, banned).not.toMatch(new RegExp(`\\b${banned}\\b`));
    }
  });
});


describe("revising an existing version", () => {
  const base = compileDefinition(compiled(GOOD_DRAFT), CATALOGUE);
  if (base.status !== "COMPILED") throw new Error("fixture must compile");
  const before = base.definition;

  function after(patch: Partial<DefinitionDraft>) {
    const r = compileDefinition(compiled({ ...GOOD_DRAFT, ...patch }), CATALOGUE);
    if (r.status !== "COMPILED") throw new Error("patched fixture must compile");
    return r.definition;
  }

  it("reports nothing when nothing moved", () => {
    expect(diffDefinitions(before, before)).toEqual([]);
  });

  it("names the field, what it was, and what it became", () => {
    const changes = diffDefinitions(before, after({ stopLossPercent: 7 }));
    expect(changes).toEqual([{ field: "Stop-loss", from: "5% below entry", to: "7% below entry" }]);
  });

  /**
   * The property the whole revision flow rests on. A model asked to widen a
   * stop can re-round the sizing or drop an instrument on the way past, and a
   * rendered rule set shows what the rules *now are* — not what moved. The diff
   * is what turns "the prompt asked it not to" into something the user checks.
   */
  it("catches a change the user did not ask for, alongside the one they did", () => {
    const sneaky = after({ stopLossPercent: 7, riskPercent: 3, instruments: ["NSE:TCS"] });
    const fields = diffDefinitions(before, sneaky).map((c) => c.field);
    expect(fields).toContain("Stop-loss");
    expect(fields).toContain("Sizing");
    expect(fields).toContain("Universe");
    expect(fields).toHaveLength(3);
  });

  it("sees every component a revision could touch", () => {
    // A field the diff cannot express is a field a revision could change
    // silently, so the two lists must stay the same length.
    expect(definitionRows(before)).toHaveLength(11);
    const everything = after({
      instruments: ["NSE:TCS"], minAvgTurnoverPaise: null, stopLossPercent: 7,
      targetPercent: null, riskPercent: 2, maxConcurrentPositions: 3,
      maxExposurePercent: 20, initialCapitalPaise: 50_000_000,
      entry: { left: { kind: "SMA", period: 20 }, comparator: "CROSSES_ABOVE", right: { kind: "SMA", period: 50 } },
      exit: { left: { kind: "SMA", period: 20 }, comparator: "CROSSES_BELOW", right: { kind: "SMA", period: 50 } },
    });
    // Timeframe is the one component with a single legal value today.
    expect(diffDefinitions(before, everything)).toHaveLength(10);
  });

  it("shows the model the current rules, and tells it to change only what was asked", () => {
    const input = buildCompileInput({
      idea: "widen the stop to 7%",
      catalogue: CATALOGUE,
      defaultCapitalPaise: 10_000_000,
      current: before,
    });
    expect(input.current).toEqual(before);
    expect(String(input.system)).toContain("Change only what the user asked you to change");
    expect(REVISE_SYSTEM_PROMPT).toContain("byte-identical");
  });

  it("says nothing about revising when authoring from scratch", () => {
    const input = buildCompileInput({
      idea: "buy the dip",
      catalogue: CATALOGUE,
      defaultCapitalPaise: 10_000_000,
    });
    expect(input.current).toBeUndefined();
    expect(String(input.system)).not.toContain("EXISTING strategy");
  });
});
