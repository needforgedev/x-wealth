import { MoneyError, priceFromString, priceToString, type PriceTicks } from "./money";
import { isSymbol } from "./symbol";

/**
 * Trade calls and market views — the two things an advisor posts into a group.
 *
 * They are separate objects on purpose. A **call** is priced and actionable:
 * buy this instrument, at this price, with this stop. A **view** is directional
 * commentary: bullish on NIFTY. Keeping the word "signal" meaning only the
 * first is what will let `signals.forward_test_id` go back to `NOT NULL`
 * without anyone first having to sort real calls from opinions.
 *
 * ## What is validated here, and why
 *
 * Not shape — the database already rejects a negative price and an unqualified
 * symbol. What this module checks is *coherence*, which SQL cannot see: that a
 * stop-loss sits on the losing side of the entry, that targets run away from
 * the entry in the direction of the trade, that a validity window ends after it
 * begins. Every one of those is a field-swap or a typo that produces a
 * perfectly valid row telling an investor to do something incoherent.
 *
 * Both parsers return the normalised value, not just a verdict, so nothing
 * downstream re-parses a string that has already been checked.
 */

export const TRADE_SIDES = ["BUY", "SELL"] as const;
export type TradeSide = (typeof TRADE_SIDES)[number];

export const RISK_PROFILES = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskProfile = (typeof RISK_PROFILES)[number];

export const MARKET_STANCES = ["BULLISH", "BEARISH", "NEUTRAL"] as const;
export type MarketStance = (typeof MARKET_STANCES)[number];

/**
 * Mirrors the CHECK constraints in migration 0006. If you change one, change
 * the other — a limit enforced in only one of the two places is a limit that
 * disagrees with itself.
 */
export const LIMITS = {
  targets: { max: 10 },
  /** The cap that keeps a market view from being a chat message. */
  note: { max: 280 },
  rationale: { max: 500 },
} as const;

/** Structurally identical to the strategy validator's issue, and used the same way. */
export type ValidationIssue = { field: string; message: string };

export type SignalTarget = { label: string; price: string };

// ---------------------------------------------------------------------------
// Trade calls
// ---------------------------------------------------------------------------

/** Straight off the form: every field a string, nothing coerced yet. */
export type TradeCallDraft = {
  symbol: string;
  side: TradeSide;
  entryPrice: string;
  stopLoss: string;
  /** Blank when the call runs to its targets rather than a single exit. */
  exitPrice: string;
  /** In order. Blank entries are dropped, so a skipped row is not an error. */
  targets: string[];
  /** ISO. Blank `validUntil` means open-ended. */
  validFrom: string;
  validUntil: string;
  rationale: string;
  riskProfile: RiskProfile;
};

export type TradeCall = {
  symbol: string;
  side: TradeSide;
  entryPrice: PriceTicks;
  stopLoss: PriceTicks;
  exitPrice: PriceTicks | null;
  targets: SignalTarget[];
  validFrom: Date;
  validUntil: Date | null;
  rationale: string | null;
  riskProfile: RiskProfile;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

function parsePrice(
  input: string,
  field: string,
  label: string,
  issues: ValidationIssue[],
): PriceTicks | null {
  const text = input.trim();
  if (!text) {
    issues.push({ field, message: `${label} is required.` });
    return null;
  }
  try {
    const value = priceFromString(text);
    if (value <= 0) {
      issues.push({ field, message: `${label} must be more than zero.` });
      return null;
    }
    return value;
  } catch (error) {
    if (error instanceof MoneyError) {
      issues.push({ field, message: `${label} is not a valid price.` });
      return null;
    }
    throw error;
  }
}

function parseWhen(input: string, field: string, label: string, issues: ValidationIssue[]): Date | null {
  const text = input.trim();
  if (!text) {
    issues.push({ field, message: `${label} is required.` });
    return null;
  }
  const when = new Date(text);
  if (Number.isNaN(when.getTime())) {
    issues.push({ field, message: `${label} is not a valid date.` });
    return null;
  }
  return when;
}

/**
 * A BUY is stopped out below the entry and a SELL above it. Reversed, the
 * "stop" is on the winning side — which is not a stop at all, and is almost
 * always the entry and stop fields having been filled in the wrong boxes.
 */
function stopIsProtective(side: TradeSide, entry: PriceTicks, stop: PriceTicks): boolean {
  return side === "BUY" ? stop < entry : stop > entry;
}

/** The direction profit lies in: above the entry for a BUY, below for a SELL. */
function isFavourable(side: TradeSide, entry: PriceTicks, price: PriceTicks): boolean {
  return side === "BUY" ? price > entry : price < entry;
}

export function parseTradeCall(draft: TradeCallDraft): ParseResult<TradeCall> {
  const issues: ValidationIssue[] = [];

  const symbol = draft.symbol.trim().toUpperCase();
  if (!symbol) {
    issues.push({ field: "symbol", message: "Choose an instrument." });
  } else if (!isSymbol(symbol)) {
    issues.push({
      field: "symbol",
      message: `"${symbol}" is not exchange-qualified — expected e.g. NSE:RELIANCE.`,
    });
  }

  if (!TRADE_SIDES.includes(draft.side)) {
    issues.push({ field: "side", message: "Choose buy or sell." });
  }
  if (!RISK_PROFILES.includes(draft.riskProfile)) {
    issues.push({ field: "riskProfile", message: "Choose a risk profile." });
  }

  const entryPrice = parsePrice(draft.entryPrice, "entryPrice", "Entry price", issues);
  const stopLoss = parsePrice(draft.stopLoss, "stopLoss", "Stop-loss", issues);

  let exitPrice: PriceTicks | null = null;
  if (draft.exitPrice.trim()) {
    exitPrice = parsePrice(draft.exitPrice, "exitPrice", "Exit price", issues);
  }

  if (entryPrice && stopLoss && !stopIsProtective(draft.side, entryPrice, stopLoss)) {
    issues.push({
      field: "stopLoss",
      message:
        draft.side === "BUY"
          ? "On a buy, the stop-loss has to be below the entry price."
          : "On a sell, the stop-loss has to be above the entry price.",
    });
  }

  if (entryPrice && exitPrice && !isFavourable(draft.side, entryPrice, exitPrice)) {
    issues.push({
      field: "exitPrice",
      message:
        draft.side === "BUY"
          ? "On a buy, the exit price has to be above the entry price."
          : "On a sell, the exit price has to be below the entry price.",
    });
  }

  const targets = parseTargets(draft.targets, draft.side, entryPrice, issues);

  const validFrom = parseWhen(draft.validFrom, "validFrom", "Valid from", issues);
  let validUntil: Date | null = null;
  if (draft.validUntil.trim()) {
    validUntil = parseWhen(draft.validUntil, "validUntil", "Valid until", issues);
    if (validFrom && validUntil && validUntil <= validFrom) {
      issues.push({ field: "validUntil", message: "The call cannot expire before it opens." });
    }
  }

  const rationale = draft.rationale.trim();
  if (rationale.length > LIMITS.rationale.max) {
    issues.push({
      field: "rationale",
      message: `Keep the rationale under ${LIMITS.rationale.max} characters.`,
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      symbol,
      side: draft.side,
      // Non-null by construction: any failure above would have returned already.
      entryPrice: entryPrice as PriceTicks,
      stopLoss: stopLoss as PriceTicks,
      exitPrice,
      targets,
      validFrom: validFrom as Date,
      validUntil,
      rationale: rationale || null,
      riskProfile: draft.riskProfile,
    },
  };
}

/**
 * Targets run away from the entry, in order.
 *
 * T2 nearer the entry than T1 is a transposition, and it matters: an investor
 * scaling out reads them top to bottom. Labels are assigned here rather than
 * taken from input, so they always match position after blanks are dropped.
 */
function parseTargets(
  inputs: string[],
  side: TradeSide,
  entryPrice: PriceTicks | null,
  issues: ValidationIssue[],
): SignalTarget[] {
  const supplied = inputs.map((t) => t.trim()).filter(Boolean);

  if (supplied.length > LIMITS.targets.max) {
    issues.push({ field: "targets", message: `At most ${LIMITS.targets.max} targets.` });
    return [];
  }

  const targets: SignalTarget[] = [];
  let previous: PriceTicks | null = null;

  supplied.forEach((raw, index) => {
    const field = `targets.${index}`;
    const label = `T${index + 1}`;
    const value = parsePrice(raw, field, label, issues);
    if (!value) return;

    if (entryPrice && !isFavourable(side, entryPrice, value)) {
      issues.push({
        field,
        message:
          side === "BUY"
            ? `${label} has to be above the entry price.`
            : `${label} has to be below the entry price.`,
      });
      return;
    }

    if (previous !== null) {
      const movesAway = side === "BUY" ? value > previous : value < previous;
      if (!movesAway) {
        issues.push({
          field,
          message: `${label} is not further from the entry than T${index}. Targets run in order.`,
        });
        return;
      }
    }

    previous = value;
    targets.push({ label, price: priceToString(value) });
  });

  return targets;
}

// ---------------------------------------------------------------------------
// Market views
// ---------------------------------------------------------------------------

export type MarketViewDraft = {
  stance: MarketStance;
  /** Blank when the view is about the market rather than one instrument. */
  symbol: string;
  note: string;
};

export type MarketView = {
  stance: MarketStance;
  symbol: string | null;
  note: string | null;
};

export function parseMarketView(draft: MarketViewDraft): ParseResult<MarketView> {
  const issues: ValidationIssue[] = [];

  if (!MARKET_STANCES.includes(draft.stance)) {
    issues.push({ field: "stance", message: "Choose bullish, bearish or neutral." });
  }

  const symbol = draft.symbol.trim().toUpperCase();
  if (symbol && !isSymbol(symbol)) {
    issues.push({
      field: "symbol",
      message: `"${symbol}" is not exchange-qualified — expected e.g. NSE:RELIANCE.`,
    });
  }

  const note = draft.note.trim();
  if (note.length > LIMITS.note.max) {
    issues.push({
      field: "note",
      message: `A view is capped at ${LIMITS.note.max} characters. Post a call if it needs more than that.`,
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: { stance: draft.stance, symbol: symbol || null, note: note || null },
  };
}

// ---------------------------------------------------------------------------
// Disclosure
// ---------------------------------------------------------------------------

export type DisclosureSubject = {
  contactName: string | null;
  firmName: string | null;
  sebiRegistrationNo: string | null;
};

/**
 * Shown on the card itself, wherever an un-evidenced call appears.
 *
 * Exported so the composer, the feed and the disclosure text all say the same
 * thing — three wordings of this would read as three different facts.
 */
export const NOT_FORWARD_TESTED_NOTICE =
  "Not forward-tested. No paper-trading record stands behind this call.";

/**
 * The disclosure stored with the record, generated server-side at publish.
 *
 * PRD §6 wants disclosure at the point of decision rather than in a footer, and
 * contemporaneous rather than reconstructed — hence a text block frozen onto
 * the row instead of a template rendered later from whatever the advisor's
 * details happen to be by then.
 *
 * The forward-test line is part of *this* text, not only a UI badge, and that
 * is deliberate. A badge is a rendering decision some later change can drop; a
 * sentence inside an append-only column is a fact about what the investor was
 * told, and it survives.
 */
export function buildDisclosureBlock(
  advisor: DisclosureSubject,
  options: { forwardTested: boolean },
): string {
  const who = advisor.firmName?.trim() || advisor.contactName?.trim() || "This advisor";
  const registration = advisor.sebiRegistrationNo?.trim();

  const lines = [
    registration
      ? `${who} is a SEBI-registered Research Analyst (${registration}).`
      : `${who} is a SEBI-registered Research Analyst.`,
    "This is research, not a personalised recommendation, and it does not consider your circumstances.",
    "You act on it in your own broker account. X-Wealth never places an order and never holds your money.",
    options.forwardTested
      ? "Past performance does not predict future results."
      : `${NOT_FORWARD_TESTED_NOTICE} Past performance does not predict future results.`,
  ];

  return lines.join(" ");
}
