import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as hypothesis from "./hypothesis";
import {
  HYPOTHESIS_JSON_SCHEMA,
  buildHypothesisInput,
  validateHypothesis,
} from "./hypothesis";
import { SESSION_WINDOW } from "./forward-test";

const SHARPENED = {
  kind: "HYPOTHESIS",
  status: "SHARPENED",
  questions: null,
  hypothesis: {
    statement:
      "Large caps that fall over 5% in a week on no company news recover half the fall within two weeks.",
    wouldBeWrongIf:
      "Fewer than half of such falls retrace 50% of the drop within ten sessions over the window.",
    horizonSessions: 60,
  },
  challenges: [
    "Why would this persist after transaction costs, when it is visible to everyone screening for weekly falls?",
    "Who is selling into the recovery, and what do they know that the dip buyer does not?",
  ],
  priorArt: ["Short-horizon mean reversion after uninformed price pressure."],
};

const NEEDS_INPUT = {
  kind: "HYPOTHESIS",
  status: "NEEDS_INPUT",
  questions: [
    {
      id: "horizon",
      question: "Over roughly how long should the bounce play out?",
      options: ["A few days", "About two weeks", "A quarter"],
      because: "The window has to be long enough for the expectation to recur.",
    },
  ],
  hypothesis: null,
  challenges: null,
  priorArt: null,
};

describe("validateHypothesis", () => {
  it("accepts a sharpened statement with its negation and horizon", () => {
    const result = validateHypothesis(SHARPENED);
    expect(result.status).toBe("VALID");
    if (result.status !== "VALID") return;
    expect(result.view.status).toBe("SHARPENED");
    if (result.view.status !== "SHARPENED") return;
    expect(result.view.hypothesis.horizonSessions).toBe(60);
    expect(result.view.challenges).toHaveLength(2);
  });

  it("accepts a request for more input, carrying its questions", () => {
    const result = validateHypothesis(NEEDS_INPUT);
    expect(result.status).toBe("VALID");
    if (result.status !== "VALID") return;
    expect(result.view.status).toBe("NEEDS_INPUT");
    if (result.view.status !== "NEEDS_INPUT") return;
    expect(result.view.questions[0].id).toBe("horizon");
  });

  it("refuses a falsification condition that merely restates the expectation", () => {
    const result = validateHypothesis({
      ...SHARPENED,
      hypothesis: {
        ...SHARPENED.hypothesis,
        wouldBeWrongIf: SHARPENED.hypothesis.statement,
      },
    });
    expect(result.status).toBe("INVALID");
  });

  it("refuses a horizon no forward test could run", () => {
    for (const horizonSessions of [SESSION_WINDOW.min - 1, SESSION_WINDOW.max + 1, 60.5]) {
      const result = validateHypothesis({
        ...SHARPENED,
        hypothesis: { ...SHARPENED.hypothesis, horizonSessions },
      });
      expect(result.status).toBe("INVALID");
    }
  });

  it("refuses judgement vocabulary — a challenge is a question, not a rating", () => {
    const result = validateHypothesis({
      ...SHARPENED,
      challenges: ["This is a weak premise in trending markets."],
    });
    expect(result.status).toBe("INVALID");
  });

  it("refuses a grading key anywhere, the wrong kind, and non-objects", () => {
    expect(
      validateHypothesis({ ...SHARPENED, meta: { convictionScore: 8 } }).status,
    ).toBe("INVALID");
    expect(validateHypothesis({ ...SHARPENED, kind: "COMPILE" }).status).toBe("INVALID");
    for (const garbage of [null, "text", 3, []]) {
      expect(validateHypothesis(garbage).status).toBe("INVALID");
    }
  });

  it("refuses a sharpened answer with no challenges — unchallenged is unexamined (§7.2)", () => {
    expect(validateHypothesis({ ...SHARPENED, challenges: [] }).status).toBe("INVALID");
  });

  it("keeps the statement floor aligned with what the declaration form accepts", () => {
    // startForwardTest refuses hypotheses under 30 characters. A statement the
    // workbench blesses must be one the form will take, or the flow hands the
    // user a hypothesis it then rejects.
    const result = validateHypothesis({
      ...SHARPENED,
      hypothesis: { ...SHARPENED.hypothesis, statement: "Stocks go up over time." },
    });
    expect(result.status).toBe("INVALID");
  });
});

describe("the schema sent to the provider", () => {
  it("is strict, closed, bounds the horizon, and offers no verdict field", () => {
    expect(HYPOTHESIS_JSON_SCHEMA.strict).toBe(true);

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
    walk(HYPOTHESIS_JSON_SCHEMA.schema);

    for (const banned of ["score", "grade", "rating", "rank", "stars", "verdict", "quality"]) {
      expect(keys.filter((k) => k.toLowerCase().includes(banned))).toEqual([]);
    }
  });
});

/**
 * W15-06 — no market data, structurally.
 *
 * Three locks. The input surface carries only the trader's words; the domain
 * module's exports are pinned; and the action's source is scanned for every
 * route to data or to a write. The workbench is the one AI surface whose
 * value depends on what it has *not* seen.
 */
describe("no market data reaches the workbench (W15-06, §7.2)", () => {
  it("the input is the trader's words and the instructions — nothing else", () => {
    const input = buildHypothesisInput({
      idea: "dips on large caps bounce",
      answers: [{ questionId: "horizon", answer: "two weeks" }],
    });
    expect(Object.keys(input).sort()).toEqual(["answers", "idea", "system"].sort());
  });

  it("the domain module exports the workbench and nothing that reads or writes", () => {
    expect(Object.keys(hypothesis).sort()).toEqual(
      [
        "HYPOTHESIS_JSON_SCHEMA",
        "HYPOTHESIS_PROMPT_VERSION",
        "buildHypothesisInput",
        "validateHypothesis",
      ].sort(),
    );
  });

  it("the action imports no route to market data, the database, or a strategy write", () => {
    const source = readFileSync(join(__dirname, "../server/actions/hypothesis.ts"), "utf8");
    for (const forbidden of [
      "market-data",
      "loadCatalogue",
      "liveEndOfDaySource",
      "dailyBars",
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
