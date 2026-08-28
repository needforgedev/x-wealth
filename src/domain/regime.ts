import type { Bar } from "./market-data";
import type { IsoDate } from "./session";

/**
 * What kind of market a session happened in.
 *
 * `plan.md` W18-03, `CLAUDE.md` §7.7: *regime slicing — bull / bear / sideways
 * / high-vol / low-vol.* A strategy that made all its money in one regime has
 * not been tested; it has been sampled once from a market that happened to
 * suit it.
 *
 * ## Backward-looking, without exception
 *
 * Every classification here uses a trailing window ending at the session being
 * labelled. Nothing reads forward.
 *
 * That is easy to get wrong and the wrong version is seductive, because the
 * obvious way to label a regime is to look at what the market *did next* —
 * "the six months after this were a bull market". Labelling that way and then
 * attributing trades to labels produces a beautiful, meaningless analysis: the
 * regime already contains the answer, so of course the strategy's winners land
 * in the favourable one. It would be lookahead bias inside the very tool built
 * to detect lookahead bias.
 *
 * `regime.test.ts` asserts prefix invariance for exactly this reason, the same
 * property `backtest-lookahead.test.ts` asserts of the engine.
 *
 * ## Two independent axes
 *
 * Direction and volatility are separate questions. A market can fall quietly
 * and rally violently, and a strategy can be fine with one and destroyed by the
 * other, so they are reported as two labels rather than collapsed into one.
 */

export const TREND_REGIMES = ["BULL", "BEAR", "SIDEWAYS"] as const;
export type TrendRegime = (typeof TREND_REGIMES)[number];

export const VOLATILITY_REGIMES = ["HIGH_VOL", "LOW_VOL"] as const;
export type VolatilityRegime = (typeof VOLATILITY_REGIMES)[number];

export type Regime = {
  trend: TrendRegime;
  volatility: VolatilityRegime;
};

/** `BULL/HIGH_VOL` and the other five combinations, as one key. */
export type RegimeKey = `${TrendRegime}/${VolatilityRegime}`;

export function regimeKey(regime: Regime): RegimeKey {
  return `${regime.trend}/${regime.volatility}`;
}

export type RegimeSettings = {
  /** Sessions of trailing history each label is computed from. */
  lookback: number;
  /**
   * Trailing return, in percent, beyond which the window counts as trending.
   *
   * ±10% over a quarter. Chosen to be a move a trader would call a trend rather
   * than to make the buckets equal sizes — a threshold tuned until the slices
   * balance is a threshold fitted to this particular history, which is the
   * error this whole module exists to detect.
   */
  trendThresholdPercent: number;
};

export const DEFAULT_REGIME_SETTINGS: RegimeSettings = {
  lookback: 63, // ~one quarter of sessions
  trendThresholdPercent: 10,
};

export type SessionRegime = {
  date: IsoDate;
  regime: Regime;
  /** Trailing return over the lookback, percent. */
  trendPercent: number;
  /** Annualised standard deviation of trailing session returns, percent. */
  volatilityPercent: number;
};

/** Sessions in a year, matching the engine's annualisation. */
const SESSIONS_PER_YEAR = 252;

/**
 * Label every session that has enough history behind it.
 *
 * Sessions inside the lookback are **absent from the result** rather than given
 * a default label. A strategy's earliest trades genuinely happened in an
 * unclassifiable period, and inventing `SIDEWAYS` for them would put real
 * trades in a bucket the data never supported.
 *
 * The volatility split is against this series' own median, not an absolute
 * number. "High volatility" for a large-cap index and for a midcap are
 * different numbers, and a fixed threshold would label one of them entirely
 * one way and tell you nothing.
 */
export function classifySessions(
  bars: readonly Bar[],
  settings: RegimeSettings = DEFAULT_REGIME_SETTINGS,
): SessionRegime[] {
  const { lookback, trendThresholdPercent } = settings;
  if (lookback < 2) return [];

  const measured: Array<{ date: IsoDate; trendPercent: number; volatilityPercent: number }> = [];

  for (let i = lookback; i < bars.length; i++) {
    const start = bars[i - lookback].close as number;
    const end = bars[i].close as number;
    if (start <= 0) continue;

    const trendPercent = ((end - start) / start) * 100;

    // Session-over-session returns strictly inside the trailing window.
    const returns: number[] = [];
    for (let j = i - lookback + 1; j <= i; j++) {
      const previous = bars[j - 1].close as number;
      if (previous <= 0) continue;
      returns.push(((bars[j].close as number) - previous) / previous);
    }

    measured.push({
      date: bars[i].date,
      trendPercent,
      volatilityPercent: annualisedDeviation(returns) * 100,
    });
  }

  if (measured.length === 0) return [];

  /**
   * The median is **expanding**, not whole-sample.
   *
   * The obvious implementation takes the median volatility of the entire series
   * and splits against it. It is one line shorter and it is lookahead: a
   * session in 2021 would be labelled `HIGH_VOL` or not according to how
   * volatile 2025 turned out to be, so its label would change every time more
   * data arrived. Attribute trades to labels built that way and the analysis
   * quietly knows the future.
   *
   * Expanding means "high relative to everything seen up to and including this
   * session". Early labels are noisier — the first few are split against a
   * handful of observations — and that is the honest cost of not peeking.
   */
  const seen: number[] = [];

  return measured.map((m) => {
    seen.push(m.volatilityPercent);
    const threshold = median(seen);

    return {
      date: m.date,
      trendPercent: m.trendPercent,
      volatilityPercent: m.volatilityPercent,
      regime: {
        trend:
          m.trendPercent >= trendThresholdPercent
            ? "BULL"
            : m.trendPercent <= -trendThresholdPercent
              ? "BEAR"
              : "SIDEWAYS",
        // Ties go to LOW_VOL. An arbitrary call, made once and stated, rather
        // than left to floating-point comparison order.
        volatility: m.volatilityPercent > threshold ? "HIGH_VOL" : "LOW_VOL",
      },
    };
  });
}

/** Date-indexed lookup, for attributing a trade to the regime it opened in. */
export function regimeIndex(sessions: readonly SessionRegime[]): Map<IsoDate, Regime> {
  return new Map(sessions.map((s) => [s.date, s.regime]));
}

function annualisedDeviation(returns: readonly number[]): number {
  if (returns.length < 2) return 0;
  const average = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - average) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(SESSIONS_PER_YEAR);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
