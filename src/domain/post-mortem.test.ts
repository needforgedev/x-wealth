import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as postMortem from "./post-mortem";
import {
  POST_MORTEM_JSON_SCHEMA,
  buildPostMortemInput,
  validatePostMortem,
  type PostMortemFacts,
} from "./post-mortem";

/**
 * The producer here is a model, so the §7.11/§8.7 discipline the adversarial
 * suite proves about its own code (W18-10) has to hold as a *runtime gate* —
 * these tests attack the gate, in both directions, because a gate that cannot
 * fail proves nothing and a gate that flags honest description gets bypassed.
 */

const FACTS: PostMortemFacts = {
  hypothesis: {
    declared: "I expect four to six trades, most of them small losses, over the window.",
    declaredOn: "2026-01-05",
  },
  window: {
    startedOn: "2026-01-06",
    endedOn: "2026-04-02",
    plannedSessions: 60,
    initialCapitalPaise: 10_000_000,
  },
  rules: {
    entry: "RSI(14) below 30",
    exit: "RSI(14) above 60",
    stopLoss: "5% below entry",
    sizing: "1% of capital at risk per trade",
    instruments: ["NSE:RELIANCE"],
    timeframe: "DAILY",
  },
  outcome: {
    netReturnPercent: -1.24,
    tradeCount: 5,
    hitRatePercent: 40,
    maxDrawdownPercent: 3.1,
    avgWinPaise: 42_000,
    avgLossPaise: 31_000,
    exposurePercent: 22,
    sampleAdequate: false,
  },
  trades: [
    {
      symbol: "NSE:RELIANCE",
      entryDate: "2026-01-12",
      entryPrice: "1310.0000",
      exitDate: "2026-01-19",
      exitPrice: "1291.0000",
      netPnlPaise: -19_600,
    },
  ],
  costs: { segment: "NSE_EQUITY_DELIVERY", slippagePercent: 0.1 },
  backtest: {
    periodStart: "2021-01-01",
    periodEnd: "2025-12-31",
    netReturnPercent: 8.4,
    tradeCount: 61,
    maxDrawdownPercent: 9.8,
  },
};

const GOOD = {
  kind: "POST_MORTEM",
  hypothesis: {
    status: "NOT_SUPPORTED",
    observed:
      "5 trades were recorded against the expected 4 to 6, and the window closed at -1.24% net.",
  },
  findings: [
    {
      observation: "2 of the 5 trades closed positive, against a declared expectation of mostly small losses.",
      evidence: "hit rate 40%, avg win 42000 paise, avg loss 31000 paise",
    },
  ],
  summary:
    "The window recorded 5 trades and closed at -1.24% net of costs. The trade count landed inside the declared range, while the mix of outcomes differed from what was expected.",
  unanswered: ["Whether the exit rule holds outside the 22% of sessions the window was exposed."],
};

describe("validatePostMortem", () => {
  it("accepts an evidenced, descriptive output and returns the view", () => {
    const result = validatePostMortem(GOOD, { tradeCount: 5 });
    expect(result.status).toBe("VALID");
    if (result.status !== "VALID") return;
    expect(result.view.status).toBe("NOT_SUPPORTED");
    expect(result.view.findings).toHaveLength(1);
    expect(result.view.unanswered).toHaveLength(1);
  });

  it("refuses to let zero recorded trades support a hypothesis — in either direction", () => {
    for (const status of ["SUPPORTED", "NOT_SUPPORTED"]) {
      const result = validatePostMortem(
        { ...GOOD, hypothesis: { ...GOOD.hypothesis, status } },
        { tradeCount: 0 },
      );
      expect(result.status).toBe("INVALID");
    }
    // UNTESTED is the honest answer for an empty window, and it passes.
    const untested = validatePostMortem(
      {
        ...GOOD,
        hypothesis: {
          status: "UNTESTED",
          observed: "0 trades were recorded in 60 sessions; the entry rule never triggered.",
        },
      },
      { tradeCount: 0 },
    );
    expect(untested.status).toBe("VALID");
  });

  it("refuses judgement vocabulary wherever it appears", () => {
    const inFinding = validatePostMortem(
      {
        ...GOOD,
        findings: [{ observation: "A strong window with 5 trades.", evidence: "5 trades" }],
      },
      { tradeCount: 5 },
    );
    expect(inFinding.status).toBe("INVALID");

    const inSummary = validatePostMortem(
      { ...GOOD, summary: `${GOOD.summary} Overall a good result for the rules as written.` },
      { tradeCount: 5 },
    );
    expect(inSummary.status).toBe("INVALID");
  });

  it("withholds a numberless finding, keeps the evidenced ones, and says so", () => {
    // The gate's first live outing: six evidenced findings and one bare one.
    // Refusing the whole answer for the one was the wrong blast radius; the
    // right behaviour is a smaller view that admits it is smaller.
    const result = validatePostMortem(
      {
        ...GOOD,
        findings: [
          ...GOOD.findings,
          {
            observation: "The exits mostly happened before the rule fired on its own.",
            evidence: "the recorded exits",
          },
        ],
      },
      { tradeCount: 5 },
    );
    expect(result.status).toBe("VALID");
    if (result.status !== "VALID") return;
    expect(result.view.findings).toHaveLength(1);
    expect(result.view.withheldFindings).toBe(1);
  });

  it("still refuses an answer in which no finding carries a number", () => {
    const result = validatePostMortem(
      {
        ...GOOD,
        findings: [
          {
            observation: "The exits mostly happened before the rule fired on its own.",
            evidence: "the recorded exits",
          },
        ],
      },
      { tradeCount: 5 },
    );
    expect(result.status).toBe("INVALID");
  });

  it("a judgement word in a finding is fatal even when that finding would be withheld", () => {
    const result = validatePostMortem(
      {
        ...GOOD,
        findings: [
          ...GOOD.findings,
          { observation: "A solid stretch for the entry rule overall.", evidence: "the window" },
        ],
      },
      { tradeCount: 5 },
    );
    expect(result.status).toBe("INVALID");
  });

  it("refuses a grading key anywhere in the object, whatever its value", () => {
    const result = validatePostMortem(
      { ...GOOD, extras: { confidenceScore: 4 } },
      { tradeCount: 5 },
    );
    expect(result.status).toBe("INVALID");
    if (result.status !== "INVALID") return;
    expect(result.issues.some((i) => i.message.includes("§8.7"))).toBe(true);
  });

  it("refuses the wrong kind, an empty findings list, and one that is too long", () => {
    expect(validatePostMortem({ ...GOOD, kind: "COMPILE" }, { tradeCount: 5 }).status).toBe(
      "INVALID",
    );
    expect(validatePostMortem({ ...GOOD, findings: [] }, { tradeCount: 5 }).status).toBe("INVALID");
    expect(
      validatePostMortem(
        { ...GOOD, findings: Array(9).fill(GOOD.findings[0]) },
        { tradeCount: 5 },
      ).status,
    ).toBe("INVALID");
  });

  it("refuses non-objects outright", () => {
    for (const garbage of [null, "text", 4, ["a"]]) {
      expect(validatePostMortem(garbage, { tradeCount: 5 }).status).toBe("INVALID");
    }
  });
});

describe("the schema sent to the provider", () => {
  it("is strict, closed, and offers no field a verdict could live in", () => {
    expect(POST_MORTEM_JSON_SCHEMA.strict).toBe(true);

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
    walk(POST_MORTEM_JSON_SCHEMA.schema);

    for (const banned of ["score", "grade", "rating", "rank", "stars", "verdict", "quality"]) {
      expect(keys.filter((k) => k.toLowerCase().includes(banned))).toEqual([]);
    }
  });
});

describe("what the model is shown", () => {
  it("is the recorded facts plus instructions, and nothing identifying", () => {
    const input = buildPostMortemInput(FACTS);
    expect(typeof input.system).toBe("string");
    expect(Object.keys(input).sort()).toEqual(
      ["backtest", "costs", "hypothesis", "outcome", "rules", "system", "trades", "window"].sort(),
    );
  });
});

/**
 * W7-10 — no critique output path can reach a strategy write.
 *
 * Two locks. The domain module's export list is pinned, so a write helper
 * cannot quietly appear on it; and the action's source is scanned for the
 * tokens a write would need, because the guarantee is about the whole path
 * from model output to database, not just this module.
 */
describe("the read-only boundary (W7-10, §10.6)", () => {
  it("the domain module exports analysis and nothing that writes", () => {
    expect(Object.keys(postMortem).sort()).toEqual(
      [
        "HYPOTHESIS_STATUSES",
        "POST_MORTEM_JSON_SCHEMA",
        "POST_MORTEM_PROMPT_VERSION",
        "buildPostMortemInput",
        "validatePostMortem",
      ].sort(),
    );
  });

  it("the action never touches a strategy table or issues a write of its own", () => {
    const source = readFileSync(
      join(__dirname, "../server/actions/post-mortem.ts"),
      "utf8",
    );

    // The only door to the database this action may use is runInteraction,
    // whose single INSERT is the log itself.
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
