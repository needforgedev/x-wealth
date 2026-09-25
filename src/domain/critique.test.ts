import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as critique from "./critique";
import {
  CRITIQUE_JSON_SCHEMA,
  buildCritiqueInput,
  validateCritique,
  type CritiqueFacts,
} from "./critique";

/**
 * Same producer problem as the post-mortem: the discipline W18-10 proves about
 * our own code has to be a runtime gate here, attacked in both directions.
 * Where behaviour is shared (`ai-gate.ts`), these tests deliberately overlap
 * the post-mortem's — the overlap is the point, one vocabulary in one place.
 */

const FACTS: CritiqueFacts = {
  backtestRunId: "00000000-0000-0000-0000-000000000001",
  period: { start: "2021-01-01", end: "2025-12-31" },
  initialCapitalPaise: 10_000_000,
  rules: {
    entry: "SMA(20) above SMA(50)",
    exit: "SMA(20) below SMA(50)",
    stopLoss: "5% below entry",
    target: null,
    sizing: "25% of capital per position",
    instruments: ["NSE:RELIANCE", "NSE:TCS"],
    timeframe: "DAILY",
  },
  parameters: [
    { label: "SMA(20) on the entry", value: 20 },
    { label: "SMA(50) on the entry", value: 50 },
    { label: "stop-loss percent", value: 5 },
  ],
  parameterCount: 3,
  results: {
    netReturnPercent: 4.77,
    grossReturnPercent: 6.9,
    totalCostsPaise: 212_000,
    tradeCount: 30,
    hitRatePercent: 43.3,
    maxDrawdownPercent: 11.2,
    avgWinPaise: 91_000,
    avgLossPaise: 44_000,
    expectancyPaise: 14_500,
    profitFactor: 1.4,
    longestLosingStreak: 7,
    topTradeSharePercent: 38,
    exposurePercent: 61,
    sampleAdequate: false,
  },
  costs: { segment: "NSE_EQUITY_DELIVERY", slippagePercent: 0.05 },
  attack: {
    suiteVersion: "adversarial-1",
    findings: [
      {
        attack: "WALK_FORWARD",
        severity: "HIGH",
        observation: "one profitable window in four",
      },
    ],
    attacksRun: ["WALK_FORWARD", "PARAMETER_SENSITIVITY"],
    attacksSkipped: [],
  },
};

const GOOD = {
  kind: "CRITIQUE",
  findings: [
    {
      observation: "30 closed trades stand behind these figures, against 3 tunable parameters.",
      evidence: "tradeCount 30, parameterCount 3, sampleAdequate false",
    },
  ],
  summary:
    "The record carries 30 trades over five years, below the threshold at which the hit rate and return figures generalise, and the attack report found the return concentrated in one of four windows.",
  limits: ["Whether the edge survives at larger position sizes than 25% of capital."],
};

describe("validateCritique", () => {
  it("accepts an evidenced account and returns the view", () => {
    const result = validateCritique(GOOD);
    expect(result.status).toBe("VALID");
    if (result.status !== "VALID") return;
    expect(result.view.findings).toHaveLength(1);
    expect(result.view.limits).toHaveLength(1);
    expect(result.view.withheldFindings).toBe(0);
  });

  it("withholds a numberless finding, keeps the evidenced ones, and says so", () => {
    const result = validateCritique({
      ...GOOD,
      findings: [
        ...GOOD.findings,
        { observation: "The equity path leaned on its early stretch.", evidence: "the curve" },
      ],
    });
    expect(result.status).toBe("VALID");
    if (result.status !== "VALID") return;
    expect(result.view.findings).toHaveLength(1);
    expect(result.view.withheldFindings).toBe(1);
  });

  it("refuses judgement vocabulary anywhere, withheld findings included", () => {
    const inSummary = validateCritique({
      ...GOOD,
      summary: `${GOOD.summary} A solid record on the whole.`,
    });
    expect(inSummary.status).toBe("INVALID");

    const inWithheld = validateCritique({
      ...GOOD,
      findings: [
        ...GOOD.findings,
        { observation: "A promising stretch for the entry rule.", evidence: "the window" },
      ],
    });
    expect(inWithheld.status).toBe("INVALID");
  });

  it("refuses a grading key anywhere, the wrong kind, and non-objects", () => {
    expect(validateCritique({ ...GOOD, meta: { runQualityScore: 3 } }).status).toBe("INVALID");
    expect(validateCritique({ ...GOOD, kind: "POST_MORTEM" }).status).toBe("INVALID");
    for (const garbage of [null, "text", 9, []]) {
      expect(validateCritique(garbage).status).toBe("INVALID");
    }
  });

  it("refuses an answer in which no finding carries a number", () => {
    const result = validateCritique({
      ...GOOD,
      findings: [{ observation: "The figures rest on a thin stretch of history.", evidence: "the period" }],
    });
    expect(result.status).toBe("INVALID");
  });
});

describe("the schema sent to the provider", () => {
  it("is strict, closed, and offers no field a verdict could live in", () => {
    expect(CRITIQUE_JSON_SCHEMA.strict).toBe(true);

    const keys: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== "object" || node === null) return;
      const record = node as Record<string, unknown>;
      if (record.type === "object" || record.properties) {
        expect(record.additionalProperties).toBe(false);
      }
      if (record.properties && typeof record.properties === "object") {
        keys.push(...Object.keys(record.properties as object));
      }
      Object.values(record).forEach(walk);
    };
    walk(CRITIQUE_JSON_SCHEMA.schema);

    for (const banned of ["score", "grade", "rating", "rank", "stars", "verdict", "quality"]) {
      expect(keys.filter((k) => k.toLowerCase().includes(banned))).toEqual([]);
    }
  });
});

describe("what the model is shown", () => {
  it("is the recorded facts plus instructions, keyed to its run", () => {
    const input = buildCritiqueInput(FACTS);
    expect(typeof input.system).toBe("string");
    expect(input.backtestRunId).toBe(FACTS.backtestRunId);
    expect(Object.keys(input).sort()).toEqual(
      [
        "attack", "backtestRunId", "costs", "initialCapitalPaise", "parameterCount",
        "parameters", "period", "results", "rules", "system",
      ].sort(),
    );
  });
});

describe("the read-only boundary (W7-10, §10.6)", () => {
  it("the domain module exports analysis and nothing that writes", () => {
    expect(Object.keys(critique).sort()).toEqual(
      [
        "CRITIQUE_JSON_SCHEMA",
        "CRITIQUE_PROMPT_VERSION",
        "buildCritiqueInput",
        "validateCritique",
      ].sort(),
    );
  });

  it("the action never touches a strategy table or issues a write of its own", () => {
    const source = readFileSync(join(__dirname, "../server/actions/critique.ts"), "utf8");
    for (const forbidden of [
      "createStrategy",
      "reviseStrategy",
      'from "@/db"',
      ".insert(",
      ".update(",
      ".delete(",
    ]) {
      expect(source.includes(forbidden), `action source contains ${forbidden}`).toBe(false);
    }
  });
});
