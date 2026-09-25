/**
 * The post-mortem: what happened, against the declared hypothesis.
 * `plan.md` W7-13, `CLAUDE.md` §5 step 6 and §7.11.
 *
 * ## What this module is, and what it refuses to be
 *
 * A forward test ends and the record is complete: the hypothesis written before
 * the window opened, the rules frozen at the start, and every session that
 * printed since. The post-mortem reads that record and explains it — which is a
 * different job from judging it. §7.11 draws the line exactly: *"42 trades is
 * below the threshold for statistical confidence at this win rate"*, never
 * *"this strategy is weak."*
 *
 * ## The model describes; it never prescribes
 *
 * §8.6 makes model output advisory, and §10.6 makes the read-only boundary a
 * legal one. Nothing in this module can write, and the output shape has no
 * field a recommendation could live in: no suggested parameters, no "next
 * steps", no verdict. What the author does with the explanation is step 7 of
 * the loop — take live, revise or abandon — and all three are the author's
 * decisions, recorded elsewhere on their own terms.
 *
 * ## The model's output is untrusted input
 *
 * The same rule as the compiler (`compile.ts`): a schema-constrained response
 * is still a response from a language model. `validatePostMortem` is the gate —
 * it re-checks the shape, refuses judgement vocabulary, requires every piece of
 * evidence to carry a number, and enforces the one rule a model under pressure
 * will eventually break: **a window with zero trades answered nothing**, so its
 * hypothesis status must be UNTESTED. The adversarial suite holds itself to
 * this bar in its tests (W18-10); here the producer is a model rather than our
 * own code, so the bar has to be enforced at runtime, on every single output.
 *
 * ## Everything numeric is computed by us
 *
 * The input the model sees is assembled from recorded rows: the frozen
 * parameters, the final metrics the engine wrote, the paper trades the evening
 * job recorded. The model's job is to connect those numbers to the hypothesis
 * in plain language — not to compute anything, because a model that computes
 * is a model that miscomputes plausibly.
 */
import type { IsoDate } from "./session";

/** Bumped whenever the schema or the prompt changes. Recorded on every row. */
export const POST_MORTEM_PROMPT_VERSION = "post-mortem-1";

// ---------------------------------------------------------------------------
// What the model is shown — recorded facts, nothing else
// ---------------------------------------------------------------------------

/** One recorded paper trade, as the model sees it. */
export type PostMortemTrade = {
  readonly symbol: string;
  readonly entryDate: IsoDate;
  readonly entryPrice: string;
  readonly exitDate: IsoDate | null;
  readonly exitPrice: string | null;
  readonly netPnlPaise: number | null;
};

/**
 * Everything the post-mortem is written against. Assembled from the database
 * by the caller; every number here was computed by the engine or recorded by
 * the evening job, none by a model.
 */
export type PostMortemFacts = {
  readonly hypothesis: {
    /** Verbatim, as declared before the window opened. */
    readonly declared: string;
    readonly declaredOn: IsoDate;
  };
  readonly window: {
    readonly startedOn: IsoDate;
    readonly endedOn: IsoDate;
    readonly plannedSessions: number;
    readonly initialCapitalPaise: number;
  };
  /** The frozen rules, in the same plain words the console shows. */
  readonly rules: {
    readonly entry: string;
    readonly exit: string;
    readonly stopLoss: string;
    readonly sizing: string;
    readonly instruments: readonly string[];
    readonly timeframe: string;
  };
  /** The recorded result — `final_results`, written once at completion. */
  readonly outcome: {
    readonly netReturnPercent: number;
    readonly tradeCount: number;
    readonly hitRatePercent: number | null;
    readonly maxDrawdownPercent: number;
    readonly avgWinPaise: number;
    readonly avgLossPaise: number;
    readonly exposurePercent: number;
    /** §8.12 — computed by us, stated to the model, never left to inference. */
    readonly sampleAdequate: boolean;
  };
  readonly trades: readonly PostMortemTrade[];
  /** What "net" meant in this window, so no figure is ambiguous to the model. */
  readonly costs: {
    readonly segment: string;
    readonly slippagePercent: number;
  };
  /**
   * The most recent backtest of the same version, if one exists. The forward
   * versus backtest comparison is the product's whole claim, so when both
   * exist the post-mortem should read them side by side.
   */
  readonly backtest: {
    readonly periodStart: IsoDate;
    readonly periodEnd: IsoDate;
    readonly netReturnPercent: number;
    readonly tradeCount: number;
    readonly maxDrawdownPercent: number;
  } | null;
};

/**
 * Short and clinical on purpose. The model is explaining a record to the
 * person who wrote the rules — §7.11 and §8.7 forbid grading, and step 7 of
 * the loop (take live / revise / abandon) belongs to the author, so the prompt
 * gives the model nowhere to go beyond description.
 */
const SYSTEM = [
  "You write the post-mortem record for a completed paper-trading forward test.",
  "Everything in the input is recorded fact: a hypothesis declared before the",
  "window opened, the rules frozen at the start, and what the simulation",
  "recorded. Compare the hypothesis with the record and explain what happened.",
  "Rules: cite numbers from the input in every finding; describe, never advise —",
  "no recommendations, no predictions, no suggested changes, no praise or blame;",
  "if the window recorded zero trades its status is UNTESTED, and the useful",
  "explanation is which rule never triggered. Give three to six findings, each",
  "citing at least one figure from the input. Write plainly, for the author.",
].join(" ");

/** The exact payload for `runInteraction` — recorded verbatim in the log. */
export function buildPostMortemInput(facts: PostMortemFacts): Record<string, unknown> {
  return { system: SYSTEM, ...facts };
}

// ---------------------------------------------------------------------------
// What the model is allowed to return
// ---------------------------------------------------------------------------

/**
 * Whether the window answered the declared hypothesis.
 *
 * A statement about the *hypothesis against the data* — the falsifiability the
 * whole loop exists to provide — not about the strategy's quality, which §8.7
 * forbids anyone here to grade. UNTESTED is a first-class answer: a window the
 * rules never traded in has answered nothing, however it ended.
 */
export const HYPOTHESIS_STATUSES = ["SUPPORTED", "NOT_SUPPORTED", "UNTESTED"] as const;
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];

export type PostMortemFinding = {
  /** One observation, plain words, at least one number in it. */
  readonly observation: string;
  /** Which recorded figures the observation rests on. */
  readonly evidence: string;
};

export type PostMortemOutput = {
  readonly kind: "POST_MORTEM";
  readonly hypothesis: {
    readonly status: string;
    /** What the record shows, held against what was declared. */
    readonly observed: string;
  };
  readonly findings: readonly PostMortemFinding[];
  /** Plain-language account for the author (`W7-12`). */
  readonly summary: string;
  /** What this window could not settle. Empty is a valid answer. */
  readonly unanswered: readonly string[];
};

/** The validated shape the console renders. Identical fields, proven content. */
export type PostMortemView = {
  readonly status: HypothesisStatus;
  readonly observed: string;
  readonly findings: readonly PostMortemFinding[];
  /**
   * Findings the gate withheld for carrying no number (§7.11 — a finding
   * without evidence is an opinion). Counted rather than hidden, so the screen
   * can say the record holds more than it shows. Verified live: the first real
   * model answer carried six evidenced findings and one bare one, and refusing
   * all seven for the one was the wrong blast radius — a tone violation
   * anywhere still fails the whole answer, but a missing number fails only
   * the finding that lacks it.
   */
  readonly withheldFindings: number;
  readonly summary: string;
  readonly unanswered: readonly string[];
};

// ---------------------------------------------------------------------------
// The JSON Schema sent to the provider
// ---------------------------------------------------------------------------

export const POST_MORTEM_JSON_SCHEMA = {
  name: "forward_test_post_mortem",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "hypothesis", "findings", "summary", "unanswered"],
    properties: {
      kind: { type: "string", enum: ["POST_MORTEM"] },
      hypothesis: {
        type: "object",
        additionalProperties: false,
        required: ["status", "observed"],
        properties: {
          status: {
            type: "string",
            enum: [...HYPOTHESIS_STATUSES],
            description:
              "Whether the record answers the declared hypothesis. UNTESTED when " +
              "the window produced no trades or too few sessions bear on it.",
          },
          observed: {
            type: "string",
            description: "What the record shows, with the numbers, held against what was declared.",
          },
        },
      },
      findings: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["observation", "evidence"],
          properties: {
            observation: {
              type: "string",
              description: "One factual observation. Must contain at least one number.",
            },
            evidence: {
              type: "string",
              description: "The recorded figures this rests on, e.g. '2 trades, both stopped'.",
            },
          },
        },
      },
      summary: {
        type: "string",
        description: "A short plain-language account of the window, for its author.",
      },
      unanswered: {
        type: "array",
        maxItems: 4,
        items: { type: "string" },
        description: "Questions this window could not settle. May be empty.",
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// The gate — model output in, proven view out
// ---------------------------------------------------------------------------

/**
 * Words that turn an observation into a grade. The same list the adversarial
 * suite's tests enforce on our own code (W18-10) — held here at runtime,
 * because this producer is a model and a test cannot see what it will say
 * tomorrow.
 */
const JUDGEMENT = /\b(weak|strong|bad|good|poor|excellent|promising|solid|impressive|terrible)\b/i;

/**
 * Key names that must not exist anywhere in the output, whatever their value.
 * The schema already refuses them via `additionalProperties: false`; this is
 * the second lock, so a schema edit cannot quietly open the door §8.7 closes.
 */
const BANNED_KEYS = ["score", "grade", "rating", "rank", "stars", "verdict", "quality"];

export type PostMortemIssue = { readonly path: string; readonly message: string };

export type PostMortemResult =
  | { readonly status: "VALID"; readonly view: PostMortemView }
  | { readonly status: "INVALID"; readonly issues: readonly PostMortemIssue[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The one recorded fact the gate cross-checks. Deliberately not the whole
 * `PostMortemFacts`: the console re-validates a stored output before
 * rendering it, and it should not have to reassemble the entire snapshot to
 * check a rule that reads a single number.
 */
export type PostMortemRecord = { readonly tradeCount: number };

export function validatePostMortem(output: unknown, record: PostMortemRecord): PostMortemResult {
  const issues: PostMortemIssue[] = [];
  const flag = (path: string, message: string) => issues.push({ path, message });

  if (!isRecord(output)) return { status: "INVALID", issues: [{ path: "", message: "not an object" }] };
  if (output.kind !== "POST_MORTEM") flag("kind", "wrong kind");

  // No key anywhere may carry a grading name — walk the whole object.
  const walkKeys = (value: unknown, path: string) => {
    if (Array.isArray(value)) return value.forEach((v, i) => walkKeys(v, `${path}[${i}]`));
    if (!isRecord(value)) return;
    for (const [k, v] of Object.entries(value)) {
      const lower = k.toLowerCase();
      if (BANNED_KEYS.some((b) => lower.includes(b))) {
        flag(`${path}.${k}`, "a grading field is not a shape this record can hold (§8.7)");
      }
      walkKeys(v, `${path}.${k}`);
    }
  };
  walkKeys(output, "$");

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

  const hypothesis = isRecord(output.hypothesis) ? output.hypothesis : {};
  const status = hypothesis.status;
  if (!HYPOTHESIS_STATUSES.includes(status as HypothesisStatus)) {
    flag("hypothesis.status", "not a recognised status");
  }
  /**
   * The rule a model will eventually break under an eager prompt: a window in
   * which the rules never traded has not tested anything, in either direction.
   * Deterministic here — our trade count, not the model's reading of it.
   */
  if (record.tradeCount === 0 && status !== "UNTESTED") {
    flag("hypothesis.status", "zero recorded trades cannot support or refute a hypothesis");
  }
  const observed = text(hypothesis.observed, "hypothesis.observed", 20);

  const rawFindings = Array.isArray(output.findings) ? output.findings : [];
  if (rawFindings.length < 1 || rawFindings.length > 8) {
    flag("findings", "between one and eight findings");
  }
  const findings: PostMortemFinding[] = [];
  let withheldFindings = 0;
  rawFindings.forEach((f, i) => {
    const rec = isRecord(f) ? f : {};
    const observation = typeof rec.observation === "string" ? rec.observation.trim() : "";
    const evidence = typeof rec.evidence === "string" ? rec.evidence.trim() : "";

    // Tone is fatal wherever it appears — a graded finding poisons the whole
    // answer even if it was about to be withheld anyway.
    for (const [value, path] of [
      [observation, `findings[${i}].observation`],
      [evidence, `findings[${i}].evidence`],
    ] as const) {
      if (JUDGEMENT.test(value)) {
        flag(path, "judgement vocabulary — state what the numbers did, not how it rates (§7.11)");
      }
    }

    // A finding with no number is an opinion (§7.11) — withheld, not fatal.
    // Verified against the first live answer: six evidenced findings and one
    // bare one, and refusing all seven for the one was the wrong blast radius.
    if (!/\d/.test(`${observation} ${evidence}`)) {
      withheldFindings++;
      return;
    }

    if (observation.length < 20) flag(`findings[${i}].observation`, "expected at least 20 characters of text");
    if (evidence.length < 3) flag(`findings[${i}].evidence`, "expected at least 3 characters of text");
    findings.push({ observation, evidence });
  });
  if (findings.length === 0 && rawFindings.length > 0) {
    flag("findings", "no finding carried a number, so there is nothing showable (§7.11)");
  }

  const summary = text(output.summary, "summary", 40);

  const rawUnanswered = Array.isArray(output.unanswered) ? output.unanswered : [];
  const unanswered = rawUnanswered
    .slice(0, 4)
    .map((q, i) => text(q, `unanswered[${i}]`, 10))
    .filter((q) => q.length > 0);

  if (issues.length > 0) return { status: "INVALID", issues };

  return {
    status: "VALID",
    view: {
      status: status as HypothesisStatus,
      observed,
      findings,
      withheldFindings,
      summary,
      unanswered,
    },
  };
}
