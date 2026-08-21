import { MarketDataError, type Bar } from "../../domain/market-data";
import { priceFromString, type PriceTicks } from "../../domain/money";
import { istDateOf, type IsoDate } from "../../domain/session";

/**
 * Upstox as a source of daily candles.
 *
 * Chosen after testing the alternatives (see `plan.md` W3-09). What settled it:
 * the v3 historical-candle endpoint returns true OHLCV, daily history reaches
 * back to January 2000, and the series is corporate-action **adjusted** —
 * verified against the RELIANCE 1:1 bonus of 28 Oct 2024, where the close runs
 * 1327.85 → 1334.35 rather than gapping the ~50% an unadjusted series would.
 *
 * This module fetches and converts. It does not decide what to fetch and it
 * does not write anything — `scripts/load-market-data.ts` does both, and
 * `eod-source.ts` serves what was written. The engine never sees this file.
 *
 * ## Imports here are relative, not `@/`
 *
 * Everything else under `src/server` uses the `@/` alias. This directory does
 * not, because the loader script runs under plain `node` (which strips types
 * but resolves no tsconfig paths). Relative specifiers work in Next, in vitest
 * and in bare node; `@/` works in the first two only.
 */

/** Upstox's own name for itself, written into `daily_bars.source`. */
export const UPSTOX_SOURCE = "upstox-v3";

const BASE = "https://api.upstox.com/v3/historical-candle";

/**
 * The daily series is back-adjusted for splits, bonuses and dividends.
 *
 * Asserted here as a constant rather than read from a response field, because
 * Upstox does not document it and returns no such field. It was established by
 * experiment, which makes it exactly the kind of fact that can change under us
 * without notice — `upstox.test.ts` pins the bonus case so a silent switch to
 * raw prices fails a test rather than quietly halving a backtest.
 */
export const UPSTOX_DAILY_ADJUSTMENT = "ADJUSTED" as const;

/**
 * Days per request, capped by the vendor at one decade.
 *
 * Asking for more does not truncate — it returns `UDAPI1148 Invalid date range`
 * and no data at all. The loader chunks against this rather than discovering it
 * halfway through a backfill.
 */
export const MAX_DAILY_RANGE_YEARS = 10;

export class UpstoxError extends Error {}

/**
 * One candle exactly as the wire delivers it: `[timestamp, o, h, l, c, volume, oi]`.
 *
 * Prices arrive as JSON numbers, which is the one thing this codebase does not
 * allow a price to be. See `toTicks` for how they stop being floats.
 */
type RawCandle = [string, number, number, number, number, number, number];

/**
 * A JSON number back to an exact decimal string, then to ticks.
 *
 * `x-wealth-product.md` §10 says no float ever touches a price, and `money.ts`
 * enforces that by only parsing strings. But JSON has no decimal type — by the
 * time `JSON.parse` hands us 1309.55 it is already a double, and the value we
 * want is unrecoverable from any arithmetic we could do on it.
 *
 * What *is* recoverable is the literal. ECMAScript specifies `String(n)` as the
 * shortest decimal string that round-trips to the same double, so for any price
 * the vendor could have sent, `String` returns the digits they sent. Handing
 * that to `priceFromString` gets us to ticks by exact integer parsing, with no
 * multiplication by 10,000 anywhere and no rounding decision to get wrong.
 *
 * `1309.55 * 10_000` is 13095499.999999998. This path never computes it.
 */
function toTicks(value: number, label: string): PriceTicks {
  if (!Number.isFinite(value)) {
    throw new UpstoxError(`${label} is not a finite number: ${value}`);
  }

  const text = String(value);
  // `String` switches to exponent form outside ~1e21 and below ~1e-7. No
  // instrument price is in either range, so seeing one means the field is not
  // a price and guessing at it would be worse than stopping.
  if (text.includes("e") || text.includes("E")) {
    throw new UpstoxError(`${label} is not in plain decimal form: ${text}`);
  }

  return priceFromString(text);
}

/**
 * The IST calendar date a candle belongs to.
 *
 * Upstox stamps daily candles at midnight IST with an explicit `+05:30`, so the
 * date is already in the string. It is still parsed to an instant and converted
 * rather than sliced, because slicing would silently produce the wrong day the
 * first time a response arrives in UTC — and that error shifts an entire series
 * by one session, which no downstream check would catch.
 */
function toIstDate(timestamp: string, label: string): IsoDate {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new UpstoxError(`${label} has an unparseable timestamp: "${timestamp}"`);
  }
  return istDateOf(new Date(parsed));
}

/**
 * Wire candles to `Bar`s, oldest first.
 *
 * Upstox returns newest-first; the interface promises oldest-first and the
 * engine reads `t-1` for a crossover, so the sort is not cosmetic. Sorting by
 * the derived date rather than reversing the array means a vendor that changes
 * its ordering cannot flip our series without anyone noticing.
 *
 * Exported and pure so the conversion — where every interesting bug lives —
 * is testable without a network.
 */
export function candlesToBars(candles: readonly RawCandle[]): Bar[] {
  const bars = candles.map((candle, index) => {
    if (!Array.isArray(candle) || candle.length < 6) {
      throw new UpstoxError(`candle ${index} is not [timestamp, o, h, l, c, volume, …]`);
    }
    const [timestamp, open, high, low, close, volume] = candle;
    const at = `candle ${index}`;

    if (!Number.isInteger(volume) || volume < 0) {
      throw new UpstoxError(`${at}: volume must be a whole number, not ${volume}`);
    }

    return {
      date: toIstDate(timestamp, at),
      open: toTicks(open, `${at} open`),
      high: toTicks(high, `${at} high`),
      low: toTicks(low, `${at} low`),
      close: toTicks(close, `${at} close`),
      volume,
    } satisfies Bar;
  });

  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return bars;
}

export type UpstoxClient = {
  /**
   * Daily candles for one instrument key, inclusive of both ends.
   *
   * `from` and `to` are IST calendar dates. The range must not exceed
   * `MAX_DAILY_RANGE_YEARS`; the vendor rejects the whole request otherwise.
   */
  dailyCandles(instrumentKey: string, from: IsoDate, to: IsoDate): Promise<Bar[]>;
};

/**
 * Anything that behaves like `fetch`. Injected so the client can be tested
 * against recorded responses rather than the live vendor — a test that needs a
 * network and a valid token is a test that gets skipped.
 */
type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export function upstoxClient(options: {
  accessToken: string;
  fetch?: FetchLike;
}): UpstoxClient {
  const doFetch = (options.fetch ?? globalThis.fetch) as FetchLike;
  if (!options.accessToken.trim()) {
    throw new UpstoxError("an Upstox access token is required");
  }

  return {
    async dailyCandles(instrumentKey, from, to) {
      if (to < from) throw new MarketDataError(`range is backwards: ${from} to ${to}`);

      // Path segments, not query parameters. The instrument key contains a
      // pipe (`NSE_EQ|INE002A01018`) which must not reach the wire unencoded.
      const url =
        `${BASE}/${encodeURIComponent(instrumentKey)}/days/1/` +
        `${encodeURIComponent(to)}/${encodeURIComponent(from)}`;

      const response = await doFetch(url, {
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          Accept: "application/json",
        },
      });

      const body = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        throw new UpstoxError(`${instrumentKey}: response was not JSON (HTTP ${response.status})`);
      }

      if (!response.ok) throw new UpstoxError(describeError(instrumentKey, response.status, payload));

      const candles = (payload as { data?: { candles?: RawCandle[] } })?.data?.candles;
      if (!Array.isArray(candles)) {
        throw new UpstoxError(`${instrumentKey}: response had no data.candles`);
      }

      return candlesToBars(candles);
    },
  };
}

/**
 * Upstox reports failures in a body, not only a status — an expired token and a
 * plan restriction are both 401 and mean very different things to whoever is
 * reading the log at the time. Surfacing the vendor's own code and message
 * costs nothing and saves the round trip of asking what actually happened.
 */
function describeError(instrumentKey: string, status: number, payload: unknown): string {
  const errors = (payload as { errors?: Array<{ errorCode?: string; message?: string }> })?.errors;
  const first = Array.isArray(errors) ? errors[0] : undefined;
  const detail = first?.message ?? "no message";
  const code = first?.errorCode ? ` ${first.errorCode}` : "";
  return `${instrumentKey}: HTTP ${status}${code} — ${detail}`;
}
