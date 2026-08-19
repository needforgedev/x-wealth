/**
 * Exchange-qualified instrument symbols.
 *
 * `NSE:RELIANCE` and `BSE:RELIANCE` are different instruments and can trade at
 * different prices (`x-wealth-product.md` §10). A bare `RELIANCE` is never
 * valid anywhere in this system.
 *
 * The pattern below is duplicated in SQL as a CHECK constraint on
 * `paper_trades`, `signals` and `portfolio_entries`. `symbol.test.ts` reads the
 * migration and asserts the two have not drifted — if you change one, that test
 * fails until you change the other.
 */

export const SYMBOL_PATTERN = /^[A-Z]{2,6}:[A-Z0-9&._-]{1,32}$/;

/** Source of truth for the SQL side, so the drift test has something to compare. */
export const SYMBOL_PATTERN_SQL = "^[A-Z]{2,6}:[A-Z0-9&._-]{1,32}$";

export const EXCHANGES = ["NSE", "BSE"] as const;
export type Exchange = (typeof EXCHANGES)[number];

declare const SYMBOL: unique symbol;
export type Symbol_ = string & { readonly [SYMBOL]: true };

export class SymbolError extends Error {}

export function isSymbol(value: string): boolean {
  return SYMBOL_PATTERN.test(value);
}

/**
 * Validate an already-qualified symbol.
 *
 * Deliberately strict: no lowercasing, no trimming, no "helpfully" prefixing a
 * default exchange. A symbol that arrives in the wrong shape is a bug upstream,
 * and quietly repairing it here would hide the bug and could bind a trade to
 * the wrong instrument.
 */
export function toSymbol(value: string): Symbol_ {
  if (!isSymbol(value)) {
    throw new SymbolError(
      `"${value}" is not an exchange-qualified symbol — expected e.g. NSE:RELIANCE`,
    );
  }
  return value as Symbol_;
}

export function qualify(exchange: Exchange, ticker: string): Symbol_ {
  return toSymbol(`${exchange}:${ticker}`);
}

export function exchangeOf(symbol: Symbol_): Exchange {
  return symbol.slice(0, symbol.indexOf(":")) as Exchange;
}

export function tickerOf(symbol: Symbol_): string {
  return symbol.slice(symbol.indexOf(":") + 1);
}

/** Same instrument on the same exchange. */
export function sameInstrument(a: Symbol_, b: Symbol_): boolean {
  return a === b;
}
