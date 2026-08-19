/**
 * Money and prices.
 *
 * `x-wealth-product.md` §10: money is an integer count of paise, prices are
 * fixed-precision decimals, and **no float ever touches either**. This module
 * is the only place that is allowed to convert between a human decimal string
 * and the internal representation.
 *
 * Two different types, deliberately:
 *
 * - **Paise** — money. ₹1 = 100. Integer. Matches `bigint` columns in the
 *   schema.
 * - **PriceTicks** — an instrument price at 4 decimal places, stored as
 *   price × 10,000. Matches `NUMERIC(18,4)` in the schema.
 *
 * They are not interchangeable and the brands stop you mixing them up. A price
 * is not an amount of money; multiplying a price by a quantity is what produces
 * money, and `positionValue` is the only function that crosses that line.
 */

declare const PAISE: unique symbol;
declare const TICKS: unique symbol;

export type Paise = number & { readonly [PAISE]: true };
export type PriceTicks = number & { readonly [TICKS]: true };

/** Decimal places a price carries. Must match `NUMERIC(18,4)` in the schema. */
export const PRICE_SCALE = 4;
const TICKS_PER_RUPEE = 10 ** PRICE_SCALE; // 10_000
const PAISE_PER_RUPEE = 100;

export class MoneyError extends Error {}

/**
 * Postgres `bigint` is 64-bit, but JavaScript numbers are exact only to 2^53.
 * ₹90,07,19,92,54,740.99 in paise is the ceiling here — far beyond anything
 * this product handles, but the guard means we find out by exception rather
 * than by a silently wrong number.
 */
function assertSafe(value: number, what: string): void {
  if (!Number.isFinite(value)) throw new MoneyError(`${what} is not finite`);
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${what} exceeds exact integer range: ${value}`);
  }
}

/**
 * Round half away from zero — 2.5 → 3, −2.5 → −3.
 *
 * `Math.round` rounds half *up* (−2.5 → −2), which makes a loss and a gain of
 * the same size round differently. That asymmetry is not acceptable in a P&L.
 */
export function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

// ---------------------------------------------------------------------------
// Parsing — string in, integer out, no float in between
// ---------------------------------------------------------------------------

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Parse a decimal string into a scaled integer without ever constructing a
 * float. `parseFloat("1234.565") * 1000` is 1234564.9999999998; this is not.
 *
 * Digits beyond `scale` are rejected rather than silently truncated — losing
 * precision quietly is how a paisa goes missing.
 */
function parseScaled(input: string, scale: number, what: string): number {
  const text = input.trim();
  const match = DECIMAL.exec(text);
  if (!match) throw new MoneyError(`${what}: not a decimal number: "${input}"`);

  const [, sign, whole, fraction = ""] = match;
  if (fraction.length > scale) {
    throw new MoneyError(
      `${what}: "${input}" has ${fraction.length} decimal places, more than the ${scale} we can represent`,
    );
  }

  const padded = fraction.padEnd(scale, "0");
  const value = Number(`${whole}${padded}`);
  assertSafe(value, what);
  return sign === "-" ? -value : value;
}

export function paiseFromString(rupees: string): Paise {
  return parseScaled(rupees, 2, "money") as Paise;
}

export function priceFromString(rupees: string): PriceTicks {
  return parseScaled(rupees, PRICE_SCALE, "price") as PriceTicks;
}

/**
 * From a whole number of rupees. Takes an integer only — passing 10.5 here is
 * the exact float path this module exists to prevent, so it throws.
 */
export function paiseFromRupees(wholeRupees: number): Paise {
  if (!Number.isInteger(wholeRupees)) {
    throw new MoneyError(
      `money: ${wholeRupees} is not a whole number of rupees — use paiseFromString("${wholeRupees}") instead`,
    );
  }
  const value = wholeRupees * PAISE_PER_RUPEE;
  assertSafe(value, "money");
  return value as Paise;
}

/** Trusts an integer that already came from the database. */
export function paise(value: number): Paise {
  if (!Number.isInteger(value)) throw new MoneyError(`money: ${value} is not an integer`);
  assertSafe(value, "money");
  return value as Paise;
}

export function priceTicks(value: number): PriceTicks {
  if (!Number.isInteger(value)) throw new MoneyError(`price: ${value} is not an integer`);
  assertSafe(value, "price");
  return value as PriceTicks;
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

export function addPaise(...values: Paise[]): Paise {
  const total = values.reduce((sum, v) => sum + v, 0);
  assertSafe(total, "money");
  return total as Paise;
}

export function subPaise(a: Paise, b: Paise): Paise {
  return (a - b) as Paise;
}

export function negatePaise(a: Paise): Paise {
  return -a as Paise;
}

/**
 * A percentage of an amount. Rounding is explicit and applied once, here —
 * every statutory charge in the cost model goes through this, so they all round
 * the same way.
 */
export function percentOf(amount: Paise, percent: number): Paise {
  if (!Number.isFinite(percent)) throw new MoneyError(`percent is not finite: ${percent}`);
  const result = roundHalfAwayFromZero((amount * percent) / 100);
  assertSafe(result, "money");
  return result as Paise;
}

/**
 * Price × quantity → money. The single crossing point between the two types.
 *
 * ticks are rupees × 10,000 and paise are rupees × 100, so the conversion
 * divides by 100 — and rounds, because a price with four decimals times a
 * quantity does not always land on a whole paisa.
 */
export function positionValue(price: PriceTicks, qty: number): Paise {
  if (!Number.isInteger(qty)) throw new MoneyError(`quantity must be whole: ${qty}`);
  const scaled = price * qty;
  assertSafe(scaled, "position value");
  const result = roundHalfAwayFromZero(scaled / (TICKS_PER_RUPEE / PAISE_PER_RUPEE));
  assertSafe(result, "position value");
  return result as Paise;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderScaled(value: number, scale: number): string {
  const negative = value < 0;
  const digits = String(Math.abs(value)).padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Exact decimal string — what goes to the database, never to a user. */
export function paiseToString(value: Paise): string {
  return renderScaled(value, 2);
}

export function priceToString(value: PriceTicks): string {
  return renderScaled(value, PRICE_SCALE);
}

/** ₹1,23,456.78 — Indian digit grouping, for display only. */
export function formatPaise(value: Paise, { withPaise = true } = {}): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / PAISE_PER_RUPEE);
  const rest = abs % PAISE_PER_RUPEE;
  const grouped = whole.toLocaleString("en-IN");
  const tail = withPaise ? `.${String(rest).padStart(2, "0")}` : "";
  return `${negative ? "-" : ""}₹${grouped}${tail}`;
}

export function formatPrice(value: PriceTicks): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / TICKS_PER_RUPEE);
  const rest = abs % TICKS_PER_RUPEE;
  // Prices display to 2dp; the extra precision exists for arithmetic, not eyes.
  const twoDp = roundHalfAwayFromZero(rest / 100);
  const carry = twoDp === 100 ? 1 : 0;
  const shown = carry ? 0 : twoDp;
  const grouped = (whole + carry).toLocaleString("en-IN");
  return `${negative ? "-" : ""}₹${grouped}.${String(shown).padStart(2, "0")}`;
}
