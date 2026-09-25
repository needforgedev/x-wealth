/**
 * The hypothesis workbench: an idea in, a falsifiable expectation out.
 * `plan.md` W15-04…07, `CLAUDE.md` §7.2.
 *
 * ## What this module is, and what it refuses to be
 *
 * Step 1 of the loop. Before any rules exist and before any data is touched,
 * the trader writes down what they expect to happen and — the part §7.2
 * actually exists for — **what would prove them wrong**. The post-mortem
 * (W7-13) is meaningless without this anchor: a window can only answer a
 * hypothesis that was falsifiable when it was declared.
 *
 * ## No market data, structurally (W15-06)
 *
 * The workbench must not generate ideas from price data — scanning data for
 * patterns is p-hacking at the source. That is enforced in three layers, not
 * one prompt: the input type accepts only the trader's own words (no bars, no
 * catalogue, no metrics have a field to arrive in); the action imports nothing
 * that can reach market data, pinned by a source-scan test; and the prompt
 * forbids invented statistics. The model sharpens what was said. It never
 * looks at what happened.
 *
 * ## Anchored to nothing, by CHECK
 *
 * `ai_interactions_unanchored_contexts` (migration 0013): a HYPOTHESIS row may
 * name no strategy version and no forward test. A hypothesis written against a
 * strategy you already backtested is a rationalisation, and the database
 * refuses to store one dressed as the real thing.
 *
 * ## The model's output is untrusted input
 *
 * Same discipline as the compiler, the critique and the post-mortem: the gate
 * below re-checks shape, refuses grading vocabulary — challenges must arrive
 * as questions about the mechanism, not verdicts on the idea — and enforces
 * the falsifiability structure deterministically: no statement without its
 * would-be-wrong-if, no horizon outside a window a forward test could run.
 */
import { JUDGEMENT, bannedKeyIssues, type GateIssue } from "./ai-gate";
import { SESSION_WINDOW } from "./forward-test";

/** Bumped whenever the schema or the prompt changes. Recorded on every row. */
export const HYPOTHESIS_PROMPT_VERSION = "hypothesis-1";

// ---------------------------------------------------------------------------
// What the model is shown — the trader's words, nothing else
// ---------------------------------------------------------------------------

const SYSTEM = [
  "You help a retail trader turn a trading idea into a falsifiable hypothesis,",
  "before any rules are written and before any data is looked at. You are",
  "given only what the trader wrote. You have no market data, and you must not",
  "invent statistics, prices, returns or study results. Sharpen the idea into",
  "one testable expectation: what should happen, under what condition, over",
  "roughly how many trading sessions — and state exactly what recorded outcome",
  "would prove it wrong. Challenge the premise with up to four questions about",
  "its mechanism: why the pattern should exist, who is on the other side, why",
  "it should survive costs, what would break it. Questions, never judgements.",
  "Name up to three well-known idea families this belongs to, as one-line",
  "descriptions from general knowledge, without citations or figures. If the",
  "idea is too vague to sharpen, ask for what is missing instead of guessing.",
  "Never grade the idea, never predict its result.",
].join(" ");

/**
 * The whole input surface. Strings from the trader and nothing else — there
 * is deliberately no field a bar, a catalogue or a metric could arrive in.
 */
export function buildHypothesisInput(input: {
  readonly idea: string;
  readonly answers?: ReadonlyArray<{ readonly questionId: string; readonly answer: string }>;
}): Record<string, unknown> {
  return {
    system: SYSTEM,
    idea: input.idea,
    answers: input.answers ?? [],
  };
}

// ---------------------------------------------------------------------------
// What the model is allowed to return
// ---------------------------------------------------------------------------

/** One question, when the idea is too vague to sharpen. Same shape as compile's. */
export type WorkbenchQuestion = {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly because: string;
};

export type SharpenedHypothesis = {
  /** One testable expectation, in the trader's terms. */
  readonly statement: string;
  /** The falsification condition — the §7.2 deliverable. */
  readonly wouldBeWrongIf: string;
  /** Trading sessions the test needs. Bounded by what a forward test can run. */
  readonly horizonSessions: number;
};

export type HypothesisOutput = {
  readonly kind: "HYPOTHESIS";
  readonly status: string;
  readonly questions?: readonly WorkbenchQuestion[] | null;
  readonly hypothesis?: SharpenedHypothesis | null;
  /** Questions that probe the premise's mechanism. Never verdicts. */
  readonly challenges?: readonly string[] | null;
  /** Idea families from general knowledge, advisory and citation-free. */
  readonly priorArt?: readonly string[] | null;
};

export type HypothesisView =
  | { readonly status: "NEEDS_INPUT"; readonly questions: readonly WorkbenchQuestion[] }
  | {
      readonly status: "SHARPENED";
      readonly hypothesis: SharpenedHypothesis;
      readonly challenges: readonly string[];
      readonly priorArt: readonly string[];
    };

export const HYPOTHESIS_JSON_SCHEMA = {
  name: "hypothesis_workbench",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "status", "questions", "hypothesis", "challenges", "priorArt"],
    properties: {
      kind: { type: "string", enum: ["HYPOTHESIS"] },
      status: {
        type: "string",
        enum: ["NEEDS_INPUT", "SHARPENED"],
        description:
          "NEEDS_INPUT when the idea cannot be made falsifiable from what was said. Never guess.",
      },
      questions: {
        type: ["array", "null"],
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "question", "options", "because"],
          properties: {
            id: { type: "string" },
            question: { type: "string" },
            options: { type: "array", items: { type: "string" }, maxItems: 5 },
            because: { type: "string" },
          },
        },
      },
      hypothesis: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["statement", "wouldBeWrongIf", "horizonSessions"],
        properties: {
          statement: {
            type: "string",
            description:
              "One testable expectation: what should happen, under what condition. " +
              "In the trader's terms, using only figures they stated.",
          },
          wouldBeWrongIf: {
            type: "string",
            description: "The recorded outcome that would prove the expectation wrong.",
          },
          horizonSessions: {
            type: "integer",
            minimum: SESSION_WINDOW.min,
            maximum: SESSION_WINDOW.max,
            description:
              "Trading sessions the test needs to answer the hypothesis — enough for the " +
              "expected behaviour to recur, not a number that defers the answer forever.",
          },
        },
      },
      challenges: {
        type: ["array", "null"],
        maxItems: 4,
        items: { type: "string" },
        description: "Questions probing the premise's mechanism. Questions, never verdicts.",
      },
      priorArt: {
        type: ["array", "null"],
        maxItems: 3,
        items: { type: "string" },
        description: "Idea families this belongs to, one line each, no citations, no figures.",
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// The gate — model output in, proven view out
// ---------------------------------------------------------------------------

export type HypothesisResult =
  | { readonly status: "VALID"; readonly view: HypothesisView }
  | { readonly status: "INVALID"; readonly issues: readonly GateIssue[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The floor `startForwardTest` enforces on a declared hypothesis. Matched here
 * on purpose: a statement the workbench blesses must be one the declaration
 * form will accept, or the flow hands the user a hypothesis it then rejects.
 */
const STATEMENT_MIN = 30;

export function validateHypothesis(output: unknown): HypothesisResult {
  const issues: GateIssue[] = [];
  const flag = (path: string, message: string) => issues.push({ path, message });

  if (!isRecord(output)) {
    return { status: "INVALID", issues: [{ path: "", message: "not an object" }] };
  }
  if (output.kind !== "HYPOTHESIS") flag("kind", "wrong kind");

  issues.push(...bannedKeyIssues(output));

  const text = (value: unknown, path: string, min: number): string => {
    if (typeof value !== "string" || value.trim().length < min) {
      flag(path, `expected at least ${min} characters of text`);
      return "";
    }
    if (JUDGEMENT.test(value)) {
      flag(path, "judgement vocabulary — challenge the mechanism, never rate the idea (§7.2)");
    }
    return value.trim();
  };

  if (output.status === "NEEDS_INPUT") {
    const raw = Array.isArray(output.questions) ? output.questions : [];
    if (raw.length < 1 || raw.length > 4) {
      flag("questions", "NEEDS_INPUT must carry one to four questions");
    }
    const questions: WorkbenchQuestion[] = raw.map((q, i) => {
      const rec = isRecord(q) ? q : {};
      return {
        id: typeof rec.id === "string" && rec.id ? rec.id : `q${i}`,
        question: text(rec.question, `questions[${i}].question`, 10),
        options: Array.isArray(rec.options)
          ? rec.options.filter((o): o is string => typeof o === "string").slice(0, 5)
          : [],
        because: text(rec.because, `questions[${i}].because`, 10),
      };
    });
    if (issues.length > 0) return { status: "INVALID", issues };
    return { status: "VALID", view: { status: "NEEDS_INPUT", questions } };
  }

  if (output.status !== "SHARPENED") {
    flag("status", "not a recognised status");
    return { status: "INVALID", issues };
  }

  const h = isRecord(output.hypothesis) ? output.hypothesis : {};
  const statement = text(h.statement, "hypothesis.statement", STATEMENT_MIN);
  const wouldBeWrongIf = text(h.wouldBeWrongIf, "hypothesis.wouldBeWrongIf", 20);

  /**
   * The falsification condition must be its own sentence, not the expectation
   * restated. An unfalsifiable hypothesis dressed in the right fields is the
   * exact product this screen must not produce.
   */
  if (statement && wouldBeWrongIf && statement.toLowerCase() === wouldBeWrongIf.toLowerCase()) {
    flag("hypothesis.wouldBeWrongIf", "restates the expectation instead of negating it");
  }

  const horizon = h.horizonSessions;
  if (
    typeof horizon !== "number" ||
    !Number.isInteger(horizon) ||
    horizon < SESSION_WINDOW.min ||
    horizon > SESSION_WINDOW.max
  ) {
    flag(
      "hypothesis.horizonSessions",
      `a whole number of sessions between ${SESSION_WINDOW.min} and ${SESSION_WINDOW.max}`,
    );
  }

  const rawChallenges = Array.isArray(output.challenges) ? output.challenges : [];
  if (rawChallenges.length < 1 || rawChallenges.length > 4) {
    flag("challenges", "a sharpened hypothesis carries one to four challenges");
  }
  const challenges = rawChallenges.map((c, i) => text(c, `challenges[${i}]`, 15));

  const rawPriorArt = Array.isArray(output.priorArt) ? output.priorArt : [];
  const priorArt = rawPriorArt
    .slice(0, 3)
    .map((p, i) => text(p, `priorArt[${i}]`, 10))
    .filter((p) => p.length > 0);

  if (issues.length > 0) return { status: "INVALID", issues };

  return {
    status: "VALID",
    view: {
      status: "SHARPENED",
      hypothesis: {
        statement,
        wouldBeWrongIf,
        horizonSessions: horizon as number,
      },
      challenges,
      priorArt,
    },
  };
}
