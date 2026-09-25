/**
 * The critique: what in one recorded backtest limits how far it can be
 * believed. `plan.md` W7-03…07, `CLAUDE.md` §7.11.
 *
 * ## Where the numbers come from
 *
 * Not from the model. Every figure the critique cites was computed before the
 * model was involved: the run's recorded `results`, the tunable-parameter list
 * the sensitivity sweep already enumerates (`adversarial.ts`, W18-02 — one
 * enumeration, two consumers, so the critique and the sweep can never disagree
 * about what counts as a parameter), and the attack report where one exists.
 * The model's job is to connect the recorded figures into an account of the
 * run's limits — sample size against parameter count (W7-03/04), dependence on
 * one period or regime (W7-05), what the cost attacks say about feasibility
 * (W7-06), and what the drawdown path looked like (W7-07).
 *
 * ## Critique without an attack report is allowed, and says so
 *
 * Attacking is a deliberate, compute-priced step (W18-12). A run that has not
 * been attacked can still be critiqued on its own record — parameter count,
 * trade count, drawdown, concentration — and the honest critique of such a run
 * names what it cannot know yet. That is what `limits` is for, and why it is a
 * required field rather than an optional afterthought: §7.13's rule that
 * silence must be a legible output applies to unanswerable questions too.
 *
 * ## The model's output is untrusted input
 *
 * Same gate as the post-mortem, same shared vocabulary (`ai-gate.ts`): grading
 * keys refused anywhere, judgement words fatal, findings without figures
 * withheld and counted. A critique that cannot be shown is recorded and not
 * rendered — never the reverse.
 */
import { JUDGEMENT, bannedKeyIssues, type GateIssue } from "./ai-gate";
import type { IsoDate } from "./session";

/** Bumped whenever the schema or the prompt changes. Recorded on every row. */
export const CRITIQUE_PROMPT_VERSION = "critique-1";

// ---------------------------------------------------------------------------
// What the model is shown — recorded facts, nothing else
// ---------------------------------------------------------------------------

export type CritiqueFacts = {
  /** The run this critique is of. Keys the reuse lookup; never model-visible harm. */
  readonly backtestRunId: string;
  readonly period: { readonly start: IsoDate; readonly end: IsoDate };
  readonly initialCapitalPaise: number;
  /** The rules, in the same plain words every screen uses. */
  readonly rules: {
    readonly entry: string;
    readonly exit: string;
    readonly stopLoss: string;
    readonly target: string | null;
    readonly sizing: string;
    readonly instruments: readonly string[];
    readonly timeframe: string;
  };
  /**
   * Every number the author could have chosen differently, from the same
   * enumeration the sensitivity sweep perturbs (W18-02). The count against
   * `results.tradeCount` is W7-03's core signal, stated here so the model
   * reads it rather than derives it.
   */
  readonly parameters: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly parameterCount: number;
  /** The recorded result set, quoted as written. Absent figures stay null. */
  readonly results: {
    readonly netReturnPercent: number;
    readonly grossReturnPercent: number | null;
    readonly totalCostsPaise: number | null;
    readonly tradeCount: number;
    readonly hitRatePercent: number | null;
    readonly maxDrawdownPercent: number;
    readonly avgWinPaise: number | null;
    readonly avgLossPaise: number | null;
    readonly expectancyPaise: number | null;
    readonly profitFactor: number | null;
    readonly longestLosingStreak: number | null;
    readonly topTradeSharePercent: number | null;
    readonly exposurePercent: number | null;
    /** §8.12 — computed by the engine, never inferred by the model. */
    readonly sampleAdequate: boolean;
  };
  readonly costs: { readonly segment: string; readonly slippagePercent: number };
  /**
   * The latest attack report, passed through as recorded. Null when the run
   * has not been attacked — a fact the critique must name, not paper over.
   */
  readonly attack: {
    readonly suiteVersion: string;
    readonly findings: ReadonlyArray<{
      readonly attack: string;
      readonly severity: string;
      readonly observation: string;
    }>;
    readonly attacksRun: readonly string[];
    readonly attacksSkipped: ReadonlyArray<{ readonly attack: string; readonly reason: string }>;
  } | null;
};

const SYSTEM = [
  "You review one recorded backtest of a rule-based trading strategy. A",
  "backtest is the most flattering account of a strategy that exists — the one",
  "run where the rules already knew what the market did — and your job is to",
  "state, from the recorded figures alone, what limits how far this one can be",
  "believed: the trade count against the number of tunable parameters, whether",
  "the result leans on one trade or one stretch, what the drawdown path and",
  "losing streak looked like, what the cost and slippage figures imply at this",
  "size, and what the attack report found where one is present. Cite figures",
  "from the input in every finding. Describe, never advise — no recommendations,",
  "no predictions, no suggested changes, no praise or blame. If sampleAdequate",
  "is false, the sample size must be one of the findings. If no attack report",
  "is present, list what cannot be known without one under limits. Give three",
  "to six findings, each citing at least one figure. Write for the author.",
].join(" ");

/** The exact payload for `runInteraction` — recorded verbatim in the log. */
export function buildCritiqueInput(facts: CritiqueFacts): Record<string, unknown> {
  return { system: SYSTEM, ...facts };
}

// ---------------------------------------------------------------------------
// What the model is allowed to return
// ---------------------------------------------------------------------------

export type CritiqueFinding = {
  readonly observation: string;
  readonly evidence: string;
};

export type CritiqueOutput = {
  readonly kind: "CRITIQUE";
  readonly findings: readonly CritiqueFinding[];
  /** Plain-language account of the run's reliability limits, for the author. */
  readonly summary: string;
  /** What this record cannot answer — required, because silence must be legible. */
  readonly limits: readonly string[];
};

export type CritiqueView = {
  readonly findings: readonly CritiqueFinding[];
  /** Findings withheld for carrying no figures — counted, never silent. */
  readonly withheldFindings: number;
  readonly summary: string;
  readonly limits: readonly string[];
};

export const CRITIQUE_JSON_SCHEMA = {
  name: "backtest_critique",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "findings", "summary", "limits"],
    properties: {
      kind: { type: "string", enum: ["CRITIQUE"] },
      findings: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["observation", "evidence"],
          properties: {
            observation: {
              type: "string",
              description: "One factual observation about this record's limits. Must contain at least one number.",
            },
            evidence: {
              type: "string",
              description: "The recorded figures this rests on, e.g. '7 parameters, 15 trades'.",
            },
          },
        },
      },
      summary: {
        type: "string",
        description: "A short plain-language account of what bounds this backtest's credibility.",
      },
      limits: {
        type: "array",
        maxItems: 5,
        items: { type: "string" },
        description: "Questions this record cannot answer. May be empty only when nothing is missing.",
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// The gate — model output in, proven view out
// ---------------------------------------------------------------------------

export type CritiqueResult =
  | { readonly status: "VALID"; readonly view: CritiqueView }
  | { readonly status: "INVALID"; readonly issues: readonly GateIssue[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function validateCritique(output: unknown): CritiqueResult {
  const issues: GateIssue[] = [];
  const flag = (path: string, message: string) => issues.push({ path, message });

  if (!isRecord(output)) {
    return { status: "INVALID", issues: [{ path: "", message: "not an object" }] };
  }
  if (output.kind !== "CRITIQUE") flag("kind", "wrong kind");

  issues.push(...bannedKeyIssues(output));

  const text = (value: unknown, path: string, min: number): string => {
    if (typeof value !== "string" || value.trim().length < min) {
      flag(path, `expected at least ${min} characters of text`);
      return "";
    }
    if (JUDGEMENT.test(value)) {
      flag(path, "judgement vocabulary — state what the numbers did, not how it rates (§7.11)");
    }
    return value.trim();
  };

  const rawFindings = Array.isArray(output.findings) ? output.findings : [];
  if (rawFindings.length < 1 || rawFindings.length > 10) {
    flag("findings", "between one and ten findings");
  }

  const findings: CritiqueFinding[] = [];
  let withheldFindings = 0;
  rawFindings.forEach((f, i) => {
    const rec = isRecord(f) ? f : {};
    const observation = typeof rec.observation === "string" ? rec.observation.trim() : "";
    const evidence = typeof rec.evidence === "string" ? rec.evidence.trim() : "";

    // Tone is fatal wherever it appears, withheld or not.
    for (const [value, path] of [
      [observation, `findings[${i}].observation`],
      [evidence, `findings[${i}].evidence`],
    ] as const) {
      if (JUDGEMENT.test(value)) {
        flag(path, "judgement vocabulary — state what the numbers did, not how it rates (§7.11)");
      }
    }

    // A finding with no number is an opinion (§7.11) — withheld, not fatal.
    if (!/\d/.test(`${observation} ${evidence}`)) {
      withheldFindings++;
      return;
    }

    if (observation.length < 20) {
      flag(`findings[${i}].observation`, "expected at least 20 characters of text");
    }
    if (evidence.length < 3) flag(`findings[${i}].evidence`, "expected at least 3 characters of text");
    findings.push({ observation, evidence });
  });
  if (findings.length === 0 && rawFindings.length > 0) {
    flag("findings", "no finding carried a number, so there is nothing showable (§7.11)");
  }

  const summary = text(output.summary, "summary", 40);

  const rawLimits = Array.isArray(output.limits) ? output.limits : [];
  const limits = rawLimits
    .slice(0, 5)
    .map((q, i) => text(q, `limits[${i}]`, 10))
    .filter((q) => q.length > 0);

  if (issues.length > 0) return { status: "INVALID", issues };

  return { status: "VALID", view: { findings, withheldFindings, summary, limits } };
}
