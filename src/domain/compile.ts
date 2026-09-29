/**
 * Plain English in, a strategy definition out. `plan.md` W4-12, `CLAUDE.md` §7.3.
 *
 * ## What this module is, and what it refuses to be
 *
 * The product's first sentence is *"a user describes a trading idea in plain
 * English; the AI compiles it into an executable rule set."* This is the
 * compiler. It is deliberately **not** an author: §8.6 says model output is
 * advisory and never modifies a strategy definition, so what comes back here is
 * a *proposal* the user must accept. Nothing in this file writes anything.
 *
 * ## It emits data, never code
 *
 * §7.3: a strategy is structured data, never code. Tools in this category
 * generate Pine Script or Python for the user to paste elsewhere, and that
 * choice quietly costs them everything downstream — a script cannot be checked
 * for the six mandatory components by a CHECK constraint, cannot have its
 * parameters perturbed by the sensitivity sweep (`W18-02` needs named fields,
 * not source), and cannot be meaningfully frozen, because the copy that runs is
 * one the user pasted somewhere we cannot see. `StrategyDefinitionV2` can do
 * all three.
 *
 * ## The model's output is untrusted input
 *
 * A schema-constrained response is still a response from a language model. It
 * can name an instrument that does not exist, ask for RSI over 900 sessions, or
 * set a stop wider than the bounds allow. So the draft below is deliberately a
 * *different type* from `StrategyDefinitionV2`: nothing can be handed to the
 * engine without passing through `compileDefinition`, which normalises the
 * draft and then re-runs the real validator over the result. The model gets no
 * shortcut the authoring form does not have.
 */
import { MARKET_EVENT_TYPES, type MarketEventType } from "./events";
import {
  COMPARATORS,
  INDICATORS,
  LIMITS,
  TIMEFRAMES,
  type Comparator,
  type Condition,
  type EventRules,
  type InstrumentChoice,
  type Operand,
  type Sizing,
  type StrategyDefinitionV2,
  type ValidationIssue,
  describeCondition,
  describeEventRules,
  describeSizing,
  validateStrategyDefinition,
} from "./strategy";

/** Bumped whenever the schema or the prompt changes. Recorded on every row. */
export const COMPILE_PROMPT_VERSION = "compile-2";

// ---------------------------------------------------------------------------
// What the model is allowed to return
// ---------------------------------------------------------------------------

/**
 * One question, when the model cannot infer something from what was said.
 *
 * Shaped after the pattern that works: ask only for what genuinely cannot be
 * assumed, offer concrete options rather than an open prompt, and bundle every
 * remaining question into a single turn instead of an interrogation. A trader
 * who wanted to answer twenty questions would have used the form.
 *
 * `options` may be empty, which renders as free text — the right shape for
 * "how much capital", the wrong one for "which timeframe".
 */
export type IntakeQuestion = {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[];
  /** Why this could not be assumed. Shown to the user, and it keeps the model honest. */
  readonly because: string;
};

/**
 * The flattened operand the model fills in.
 *
 * `Operand` is a discriminated union, and a union expressed as `oneOf` is the
 * single most common way a structured-output call fails across models. One
 * object with optional fields is understood by all of them; `toOperand` below
 * is what turns it back into the union, rejecting the combinations the flat
 * shape makes expressible but the type does not allow.
 */
export type OperandDraft = {
  readonly kind: string;
  readonly period?: number | null;
  readonly value?: number | null;
};

export type ConditionDraft = {
  readonly left: OperandDraft;
  readonly comparator: string;
  readonly right: OperandDraft;
};

export type DefinitionDraft = {
  readonly instruments: readonly string[];
  readonly minAvgTurnoverPaise?: number | null;
  readonly timeframe: string;
  readonly entry: ConditionDraft;
  readonly exit: ConditionDraft;
  readonly stopLossPercent: number;
  readonly targetPercent?: number | null;
  readonly sizingKind: string;
  readonly riskPercent?: number | null;
  readonly capitalPercent?: number | null;
  readonly maxConcurrentPositions: number;
  readonly maxExposurePercent: number;
  readonly initialCapitalPaise: number;
  /**
   * §7.4 event rules, and null on the overwhelming majority of strategies —
   * the model only fills this when the user's own words name an event to act
   * on ("skip earnings", "flat before results", "nothing on expiry day").
   * Nested objects rather than a union, the same shape `EventRules` takes, so
   * `toEventRules` is close to a straight copy and every sub-rule is
   * independently object-or-null.
   */
  readonly eventRules?: EventRulesDraft | null;
};

export type EventWindowDraft = {
  readonly daysBefore: number;
  readonly types: readonly string[];
};

export type EventRulesDraft = {
  readonly skipEntriesWithin?: EventWindowDraft | null;
  readonly flattenBefore?: { readonly types: readonly string[] } | null;
  readonly noNewPositionsOnExpiryDay?: boolean | null;
  readonly sizeMultiplierDuring?: (EventWindowDraft & { readonly multiplier: number }) | null;
};

/**
 * Two possible answers, and the model must pick one.
 *
 * `NEEDS_INPUT` is not a failure — it is the compiler declining to invent a
 * stop-loss the user never stated. §7.3 requires all six components, and a
 * model that fills gaps silently produces a complete-looking strategy the user
 * did not author, which is the one thing Reg 16C makes us answer for.
 */
export type CompileOutput = {
  readonly kind: "COMPILE";
  readonly status: string;
  readonly questions?: readonly IntakeQuestion[];
  readonly definition?: DefinitionDraft;
  /** What the model assumed rather than asked. Shown verbatim; never silent. */
  readonly assumptions?: readonly string[];
  /** Plain-language restatement of the rules, for the author (`W7-12`). */
  readonly summary?: string;
};

// ---------------------------------------------------------------------------
// The JSON Schema sent to the provider
// ---------------------------------------------------------------------------

const OPERAND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: {
    kind: { type: "string", enum: [...INDICATORS, "PRICE", "CONSTANT"] },
    period: {
      type: ["integer", "null"],
      minimum: LIMITS.period.min,
      maximum: LIMITS.period.max,
      description: "Required for SMA, EMA and RSI. Null otherwise.",
    },
    value: {
      type: ["number", "null"],
      description: "Required for CONSTANT. Null otherwise.",
    },
  },
} as const;

const CONDITION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["left", "comparator", "right"],
  properties: {
    left: OPERAND_SCHEMA,
    comparator: { type: "string", enum: [...COMPARATORS] },
    right: OPERAND_SCHEMA,
  },
} as const;

const EVENT_TYPES_SCHEMA = {
  type: "array",
  items: { type: "string", enum: [...MARKET_EVENT_TYPES] },
  maxItems: MARKET_EVENT_TYPES.length,
  description: "Market event types this rule concerns. Empty means the rule does not apply.",
} as const;

const EVENT_WINDOW_MAX = LIMITS.eventDaysBefore.max;

/**
 * §7.4 event rules — every sub-rule nullable, and the whole block null unless
 * the user's own words named an event to act on. Nested objects rather than a
 * union, the pattern the rest of this schema uses; `toEventRules` shapes what
 * comes back and `validateStrategyDefinition` bounds it.
 */
const EVENT_RULES_SCHEMA = {
  type: ["object", "null"],
  additionalProperties: false,
  required: [
    "skipEntriesWithin",
    "flattenBefore",
    "noNewPositionsOnExpiryDay",
    "sizeMultiplierDuring",
  ],
  properties: {
    skipEntriesWithin: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["daysBefore", "types"],
      properties: {
        daysBefore: { type: "integer", minimum: 0, maximum: EVENT_WINDOW_MAX },
        types: EVENT_TYPES_SCHEMA,
      },
      description: "No new entries within this many sessions of these events. Null if not asked.",
    },
    flattenBefore: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["types"],
      properties: { types: EVENT_TYPES_SCHEMA },
      description: "Close any open position before these events. Null if not asked.",
    },
    noNewPositionsOnExpiryDay: {
      type: "boolean",
      description: "True only if the user asked to avoid opening on F&O expiry day.",
    },
    sizeMultiplierDuring: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["daysBefore", "types", "multiplier"],
      properties: {
        daysBefore: { type: "integer", minimum: 0, maximum: EVENT_WINDOW_MAX },
        types: EVENT_TYPES_SCHEMA,
        multiplier: {
          type: "number",
          minimum: LIMITS.eventSizeMultiplier.min,
          maximum: LIMITS.eventSizeMultiplier.max,
          description: "Scales entries DOWN inside the window (<= 1).",
        },
      },
      description: "Scale entry size within this window. Null if not asked.",
    },
  },
  description:
    "Market-event handling (§7.4). Null on almost every strategy — fill only when the user " +
    "explicitly names an event to skip, flatten before, avoid on expiry, or size around.",
} as const;

/**
 * The contract with the provider.
 *
 * Every bound from `LIMITS` is repeated here rather than left to the validator.
 * Not because the validator is optional — it still runs on everything — but
 * because a model told the range up front proposes a 5% stop, while a model
 * left to guess proposes 0.01% and gets rejected, and the user sees a failure
 * instead of a strategy.
 */
export const COMPILE_JSON_SCHEMA = {
  name: "strategy_compile",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "status", "questions", "definition", "assumptions", "summary"],
    properties: {
      kind: { type: "string", enum: ["COMPILE"] },
      status: {
        type: "string",
        enum: ["NEEDS_INPUT", "COMPILED"],
        description:
          "NEEDS_INPUT when any of the six mandatory components cannot be determined " +
          "from what the user said. Never guess a stop-loss or a capital figure.",
      },
      questions: {
        type: ["array", "null"],
        maxItems: 5,
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
      definition: {
        type: ["object", "null"],
        additionalProperties: false,
        required: [
          "instruments", "minAvgTurnoverPaise", "timeframe", "entry", "exit",
          "stopLossPercent", "targetPercent", "sizingKind", "riskPercent",
          "capitalPercent", "maxConcurrentPositions", "maxExposurePercent",
          "initialCapitalPaise", "eventRules",
        ],
        properties: {
          instruments: {
            type: "array",
            minItems: LIMITS.instruments.min,
            maxItems: LIMITS.instruments.max,
            items: { type: "string" },
            description: "Exchange-qualified symbols from the supplied catalogue, e.g. NSE:RELIANCE.",
          },
          minAvgTurnoverPaise: {
            type: ["integer", "null"],
            description: "Liquidity floor over 20 sessions. Null means no floor — a decision, not a default.",
          },
          timeframe: { type: "string", enum: [...TIMEFRAMES] },
          entry: CONDITION_SCHEMA,
          exit: CONDITION_SCHEMA,
          stopLossPercent: {
            type: "number",
            minimum: LIMITS.stopLossPercent.min,
            maximum: LIMITS.stopLossPercent.max,
          },
          targetPercent: {
            type: ["number", "null"],
            minimum: LIMITS.targetPercent.min,
            maximum: LIMITS.targetPercent.max,
          },
          sizingKind: { type: "string", enum: ["RISK_PERCENT", "CAPITAL_PERCENT"] },
          riskPercent: {
            type: ["number", "null"],
            minimum: LIMITS.riskPercent.min,
            maximum: LIMITS.riskPercent.max,
          },
          capitalPercent: {
            type: ["number", "null"],
            minimum: LIMITS.positionSizePercent.min,
            maximum: LIMITS.positionSizePercent.max,
          },
          maxConcurrentPositions: {
            type: "integer",
            minimum: LIMITS.maxConcurrentPositions.min,
            maximum: LIMITS.maxConcurrentPositions.max,
          },
          maxExposurePercent: {
            type: "number",
            minimum: LIMITS.maxExposurePercent.min,
            maximum: LIMITS.maxExposurePercent.max,
          },
          initialCapitalPaise: {
            type: "integer",
            minimum: LIMITS.initialCapitalPaise.min,
            maximum: LIMITS.initialCapitalPaise.max,
          },
          eventRules: EVENT_RULES_SCHEMA,
        },
      },
      assumptions: { type: ["array", "null"], items: { type: "string" }, maxItems: 8 },
      summary: { type: ["string", "null"] },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Turning a draft into a definition the engine will accept
// ---------------------------------------------------------------------------

export type CompileResult =
  | { status: "NEEDS_INPUT"; questions: readonly IntakeQuestion[] }
  | {
      status: "COMPILED";
      definition: StrategyDefinitionV2;
      assumptions: readonly string[];
      summary: string | null;
    }
  /** The model answered, and what it produced cannot be saved. */
  | { status: "REJECTED"; issues: readonly ValidationIssue[] };

function operandIssue(field: string, message: string): ValidationIssue {
  return { field, message };
}

/**
 * Flat draft back into the union, rejecting what the flattening made sayable.
 *
 * `{kind: "PRICE", period: 14}` and `{kind: "RSI"}` are both expressible in the
 * draft and neither is an `Operand`. Silently dropping the stray period, or
 * defaulting the missing one, would produce a strategy that runs and is not the
 * one the model described — the worst outcome available here, because it is the
 * one nobody notices.
 */
export function toOperand(
  draft: OperandDraft,
  field: string,
  issues: ValidationIssue[],
): Operand | null {
  const kind = draft.kind;

  if (kind === "PRICE") {
    if (draft.period != null) issues.push(operandIssue(field, "PRICE takes no period."));
    return { kind: "PRICE" };
  }

  if (kind === "CONSTANT") {
    if (draft.value == null) {
      issues.push(operandIssue(field, "CONSTANT requires a value."));
      return null;
    }
    return { kind: "CONSTANT", value: draft.value };
  }

  if ((INDICATORS as readonly string[]).includes(kind)) {
    if (draft.period == null) {
      issues.push(operandIssue(field, `${kind} requires a period.`));
      return null;
    }
    return { kind: kind as (typeof INDICATORS)[number], period: draft.period };
  }

  issues.push(operandIssue(field, `Unknown operand kind "${kind}".`));
  return null;
}

export function toCondition(
  draft: ConditionDraft,
  field: string,
  issues: ValidationIssue[],
): Condition | null {
  const left = toOperand(draft.left, `${field}.left`, issues);
  const right = toOperand(draft.right, `${field}.right`, issues);

  if (!(COMPARATORS as readonly string[]).includes(draft.comparator)) {
    issues.push(operandIssue(`${field}.comparator`, `Unknown comparator "${draft.comparator}".`));
    return null;
  }
  if (!left || !right) return null;

  return { left, comparator: draft.comparator as Comparator, right };
}

/**
 * Sizing, and the one place the draft is opinionated.
 *
 * §7.3 derives quantity from the stop. `CAPITAL_PERCENT` remains expressible
 * because six recorded versions used it, but the model is told to prefer
 * `RISK_PERCENT` and a draft that names neither is rejected rather than
 * defaulted — sizing is one of the six mandatory components, and defaulting it
 * is exactly the silent authoring this module refuses to do.
 */
export function toSizing(draft: DefinitionDraft, issues: ValidationIssue[]): Sizing | null {
  if (draft.sizingKind === "RISK_PERCENT") {
    if (draft.riskPercent == null) {
      issues.push(operandIssue("sizing", "RISK_PERCENT requires riskPercent."));
      return null;
    }
    return { kind: "RISK_PERCENT", riskPercent: draft.riskPercent };
  }
  if (draft.sizingKind === "CAPITAL_PERCENT") {
    if (draft.capitalPercent == null) {
      issues.push(operandIssue("sizing", "CAPITAL_PERCENT requires capitalPercent."));
      return null;
    }
    return { kind: "CAPITAL_PERCENT", percent: draft.capitalPercent };
  }
  issues.push(operandIssue("sizing", `Unknown sizing kind "${draft.sizingKind}".`));
  return null;
}

/**
 * The only route from model output to something savable.
 *
 * Runs `validateStrategyDefinition` against the assembled result — the same
 * function the authoring form calls, with the same catalogue — so a compiled
 * strategy is accepted on exactly the terms a hand-authored one is. If that
 * ever stops being true, the compiler has become a way around the six
 * mandatory components rather than a way to reach them.
 */
/**
 * Draft event rules → `EventRules`, or null.
 *
 * Bounds and event-type validity are left to `validateStrategyDefinition`,
 * which already owns them — this only shapes the draft and drops a sub-rule
 * the model returned "on" but empty (a skip window with no types is not a
 * rule, it is noise). If every sub-rule is empty the whole block collapses to
 * null, so "the model mentioned events but named none" compiles to a plain
 * strategy rather than a rule that never fires.
 */
export function toEventRules(draft: EventRulesDraft | null | undefined): EventRules | null {
  if (!draft) return null;

  const types = (raw: readonly string[] | undefined): MarketEventType[] =>
    (raw ?? []).filter((t): t is MarketEventType =>
      (MARKET_EVENT_TYPES as readonly string[]).includes(t),
    );

  const skipTypes = draft.skipEntriesWithin ? types(draft.skipEntriesWithin.types) : [];
  const flattenTypes = draft.flattenBefore ? types(draft.flattenBefore.types) : [];
  const sizeTypes = draft.sizeMultiplierDuring ? types(draft.sizeMultiplierDuring.types) : [];

  const rules: EventRules = {
    skipEntriesWithin:
      draft.skipEntriesWithin && skipTypes.length > 0
        ? { daysBefore: draft.skipEntriesWithin.daysBefore, types: skipTypes }
        : null,
    flattenBefore: draft.flattenBefore && flattenTypes.length > 0 ? { types: flattenTypes } : null,
    noNewPositionsOnExpiryDay: draft.noNewPositionsOnExpiryDay === true,
    sizeMultiplierDuring:
      draft.sizeMultiplierDuring && sizeTypes.length > 0
        ? {
            daysBefore: draft.sizeMultiplierDuring.daysBefore,
            types: sizeTypes,
            multiplier: draft.sizeMultiplierDuring.multiplier,
          }
        : null,
  };

  const empty =
    !rules.skipEntriesWithin &&
    !rules.flattenBefore &&
    !rules.noNewPositionsOnExpiryDay &&
    !rules.sizeMultiplierDuring;
  return empty ? null : rules;
}

export function compileDefinition(
  output: CompileOutput,
  catalogue?: readonly InstrumentChoice[],
): CompileResult {
  if (output.status === "NEEDS_INPUT") {
    const questions = output.questions ?? [];
    if (questions.length === 0) {
      return {
        status: "REJECTED",
        issues: [operandIssue("questions", "NEEDS_INPUT with no question to ask.")],
      };
    }
    return { status: "NEEDS_INPUT", questions };
  }

  if (output.status !== "COMPILED") {
    return { status: "REJECTED", issues: [operandIssue("status", `Unknown status "${output.status}".`)] };
  }

  const draft = output.definition;
  if (!draft) {
    return { status: "REJECTED", issues: [operandIssue("definition", "COMPILED with no definition.")] };
  }

  const issues: ValidationIssue[] = [];
  const entry = toCondition(draft.entry, "entry", issues);
  const exit = toCondition(draft.exit, "exit", issues);
  const sizing = toSizing(draft, issues);

  // `issues.length`, not just the nulls. An operand can be *recoverable* and
  // still wrong — `{kind: "PRICE", period: 14}` yields a usable PRICE operand
  // and records that the period had no business being there. Returning the
  // operand and dropping the issue would compile a strategy subtly unlike the
  // one described, which is the failure mode this whole module exists to avoid.
  if (!entry || !exit || !sizing || issues.length > 0) return { status: "REJECTED", issues };

  if (!(TIMEFRAMES as readonly string[]).includes(draft.timeframe)) {
    return { status: "REJECTED", issues: [operandIssue("timeframe", "Unsupported timeframe.")] };
  }

  const definition: StrategyDefinitionV2 = {
    version: 2,
    universe: {
      instruments: [...draft.instruments],
      minAvgTurnoverPaise: draft.minAvgTurnoverPaise ?? null,
    },
    timeframe: draft.timeframe as (typeof TIMEFRAMES)[number],
    direction: "LONG",
    entry,
    exit,
    targetPercent: draft.targetPercent ?? null,
    stopLossPercent: draft.stopLossPercent,
    sizing,
    maxConcurrentPositions: draft.maxConcurrentPositions,
    maxExposurePercent: draft.maxExposurePercent,
    initialCapitalPaise: draft.initialCapitalPaise,
    eventRules: toEventRules(draft.eventRules),
  };

  const validation = validateStrategyDefinition(definition, catalogue);
  if (validation.length > 0) return { status: "REJECTED", issues: validation };

  return {
    status: "COMPILED",
    definition,
    assumptions: output.assumptions ?? [],
    summary: output.summary ?? null,
  };
}

// ---------------------------------------------------------------------------
// What the model is shown
// ---------------------------------------------------------------------------

/**
 * The instruction that travels with every compile call.
 *
 * Three constraints in it are not style preferences:
 *
 * **No market data.** §7.2 — the model never scans prices for patterns, because
 * scanning data for patterns is p-hacking at the source. It is given the
 * catalogue (which symbols exist) and never a price series. This is enforced by
 * tool access, not by the wording; the wording is here so the model does not
 * ask for it.
 *
 * **No view.** §8.11 — it translates what the user said. It does not decide
 * that RELIANCE is a good buy, and it does not improve a rule it thinks is
 * weak. A model that silently tightens a stop has authored the strategy, and
 * under Reg 16C that is a thing we answer for.
 *
 * **No gaps.** All six components or `NEEDS_INPUT`. Guessing a stop-loss
 * produces a complete-looking strategy nobody authored.
 */
export const COMPILE_SYSTEM_PROMPT = [
  "You compile a retail trader's plain-English trading idea into a structured",
  "strategy definition for the Indian equity market (NSE). You are a compiler,",
  "not an adviser.",
  "",
  "Rules, in order of importance:",
  "1. Never invent any of the six mandatory components: universe, entry, exit,",
  "   stop-loss, position sizing, timeframe. If the user has not said enough to",
  "   determine one, return status NEEDS_INPUT with questions.",
  "2. Ask only for what you genuinely cannot infer. Bundle every question into",
  "   one response, offer concrete options where the choice is closed, and say",
  "   in `because` why it could not be assumed. Anything in `answers` is an",
  "   authoritative reply the user already gave — treat it as settled, never",
  "   re-ask it, and if the answers now determine all six components return",
  "   status COMPILED.",
  "3. Never form a view on a security. Do not suggest instruments the user did",
  "   not mention, and do not 'improve' a rule you think is weak. Translate.",
  "4. You have no market data and must not ask for any. You may only use symbols",
  "   from the supplied catalogue.",
  "5. Prefer RISK_PERCENT sizing: quantity derives from the distance to the stop.",
  "6. Anything you settled without asking goes in `assumptions`, in plain words.",
  "7. `summary` restates the compiled rules for the person who wrote them — what",
  "   the rules do, not whether they are any good.",
  "8. `eventRules` is null unless the user's own words name a market event to",
  "   act on — 'skip earnings', 'flat before results', 'nothing on expiry',",
  "   'trade smaller around RBI'. Never add event handling they did not ask for,",
  "   and if they name an event you have no type for, ask rather than invent.",
].join("\n");

/**
 * The extra instruction when an existing version is being revised.
 *
 * The whole risk of a compiled revision is scope: a model asked to widen a stop
 * will cheerfully re-round the sizing or tidy an instrument list on the way
 * past, and the user reading the result is reading the *new* rules, not
 * comparing them. `strategy_versions` is append-only, so an over-eager revision
 * is permanent and its lineage misleading.
 *
 * The instruction is therefore blunt, and the screen shows a field-level diff
 * regardless — this is the request, `diffDefinitions` is the check.
 */
export const REVISE_SYSTEM_PROMPT = [
  "",
  "You are revising an EXISTING strategy, supplied as `current`.",
  "",
  "8. Return the complete definition, not a patch — every field, including the",
  "   ones you are leaving alone.",
  "9. **Change only what the user asked you to change.** Every other field must",
  "   come back byte-identical to `current`. Do not re-round numbers, reorder",
  "   instruments, tidy values, or improve anything you were not asked about.",
  "10. The six components are already settled, so ask a question only if the",
  "    requested change is genuinely ambiguous. `Widen the stop` is ambiguous;",
  "    `widen the stop to 7%` is not.",
  "11. `summary` states what changed and nothing else.",
].join("\n");

/**
 * The input snapshot, recorded verbatim in `ai_interactions.input_snapshot`.
 *
 * **No PII.** Phone, email, name and date of birth never enter this object —
 * the column is retained for as long as the strategy record is, which is
 * forever. What it does carry is the idea, the tradeable symbols, and any
 * answers already given, which is the whole of what the model needs.
 */
export function buildCompileInput(input: {
  readonly idea: string;
  readonly catalogue: readonly InstrumentChoice[];
  /**
   * Prior answers, each carrying the **question text** — not just an opaque id.
   * Every compile call is a fresh, stateless model call: it invents new
   * question ids each turn and cannot match last turn's `"Q1"` to anything, so
   * an answer keyed only by id reads as answering a question it never asked and
   * it re-asks forever. The question text is what a stateless call can resolve.
   */
  readonly answers?: ReadonlyArray<{ questionId: string; question?: string; answer: string }>;
  readonly defaultCapitalPaise: number;
  /** Present when revising: the version being changed. */
  readonly current?: StrategyDefinitionV2 | null;
}): Record<string, unknown> {
  return {
    promptVersion: COMPILE_PROMPT_VERSION,
    system: input.current
      ? `${COMPILE_SYSTEM_PROMPT}\n${REVISE_SYSTEM_PROMPT}`
      : COMPILE_SYSTEM_PROMPT,
    idea: input.idea,
    ...(input.current ? { current: input.current } : {}),
    // Symbol and name only. `barCount` would invite the model to reason about
    // which instruments have more history, which is a data-driven choice.
    catalogue: input.catalogue
      .filter((c) => c.tradeable)
      .map((c) => ({ symbol: c.symbol, name: c.name })),
    // Question text first, so the model reads each as a resolved fact rather
    // than a dangling id.
    answers: (input.answers ?? []).map((a) => ({
      question: a.question ?? a.questionId,
      answer: a.answer,
    })),
    defaults: {
      timeframe: TIMEFRAMES[0],
      initialCapitalPaise: input.defaultCapitalPaise,
      note: "Use the default capital unless the user stated one. Do not ask about it.",
    },
  };
}

// ---------------------------------------------------------------------------
// Revising an existing version
// ---------------------------------------------------------------------------

/**
 * Every component of a definition, labelled once.
 *
 * Shared by the review table and the revision diff so the two cannot describe
 * the same field differently — a diff saying "Stop-loss" beside a table saying
 * "Stop %" is how a user ends up unsure whether they are looking at one field
 * or two.
 */
export function definitionRows(d: StrategyDefinitionV2): Array<[string, string]> {
  const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;
  return [
    ["Universe", d.universe.instruments.join(", ")],
    [
      "Liquidity floor",
      d.universe.minAvgTurnoverPaise === null
        ? "None"
        : `${rupees(d.universe.minAvgTurnoverPaise)} average turnover`,
    ],
    ["Timeframe", d.timeframe],
    ["Entry", describeCondition(d.entry)],
    ["Exit", describeCondition(d.exit)],
    ["Target", d.targetPercent === null ? "Exit signal only" : `${d.targetPercent}% above entry`],
    ["Stop-loss", `${d.stopLossPercent}% below entry`],
    ["Sizing", describeSizing(d.sizing)],
    ["Max positions", String(d.maxConcurrentPositions)],
    ["Max exposure", `${d.maxExposurePercent}%`],
    ["Capital", rupees(d.initialCapitalPaise)],
    // A revision that silently added or dropped an event rule would change what
    // the strategy does with no diff row to show it — the exact failure this
    // list exists to prevent (W4-12). See `diffDefinitions`.
    ["Event rules", describeEventRules(d.eventRules)],
  ];
}

export type FieldChange = { field: string; from: string; to: string };

/**
 * What a revision actually changed.
 *
 * The load-bearing property of a compiled revision is that **it changes only
 * what was asked for**. A model told to widen the stop can quietly re-round the
 * position size or drop an instrument, and a user reading a rendered rule set
 * has no way to notice — they are reading the new version, not comparing it.
 *
 * So the revision screen shows this instead of trusting the prompt. It is the
 * difference between asking the model to behave and letting the user check.
 * `strategy_versions` is append-only and its lineage is the iteration ledger,
 * so a version that changed more than its author intended is permanent.
 */
export function diffDefinitions(
  before: StrategyDefinitionV2,
  after: StrategyDefinitionV2,
): FieldChange[] {
  const b = definitionRows(before);
  const a = definitionRows(after);
  const changes: FieldChange[] = [];
  for (let i = 0; i < a.length; i++) {
    if (b[i][1] !== a[i][1]) changes.push({ field: a[i][0], from: b[i][1], to: a[i][1] });
  }
  return changes;
}
