import { evaluateForwardTest, type ForwardTestProgress } from "@/domain/forward-test";
import type { CostModel } from "@/domain/costs";
import type { Bar, MarketDataSource } from "@/domain/market-data";
import type { IsoDate } from "@/domain/session";
import { resolveDefinition, type StrategyDefinition } from "@/domain/strategy";
import { toSymbol } from "@/domain/symbol";

/**
 * Replaying a forward test from its frozen parameters.
 *
 * One path, two callers with opposite jobs: the evening job replays to work out
 * what to *write*, and the console replays to work out what to *show*. They
 * have to agree — a console reporting a trade the job would not record, or the
 * reverse, is worse than either being wrong on its own, because each looks
 * confirmed by the other.
 *
 * No caching. See the note at the top of `src/domain/forward-test.ts`: the
 * replay is a pure function of frozen parameters and immutable bars, and a
 * cached curve is a second truth that can drift from the ledger with no
 * principled way to say which is right. Sixty sessions is microseconds.
 */

/** History goes back as far as the source holds — indicators need warm-up. */
const ALL_HISTORY = { from: "1900-01-01" as IsoDate, to: "2999-12-31" as IsoDate };

export async function loadSeries(
  definition: StrategyDefinition,
  source: MarketDataSource,
): Promise<Record<string, readonly Bar[]>> {
  const series: Record<string, readonly Bar[]> = {};
  for (const instrument of resolveDefinition(definition).instruments) {
    series[instrument] = await source.dailyBars(
      toSymbol(instrument),
      ALL_HISTORY.from,
      ALL_HISTORY.to,
    );
  }
  return series;
}

export async function replayForwardTest(input: {
  /** The session the window opened on, from the frozen `started_at`. */
  startedOn: IsoDate;
  plannedSessions: number;
  initialCapitalPaise: number;
  costModel: CostModel;
  definition: StrategyDefinition;
  source: MarketDataSource;
}): Promise<ForwardTestProgress> {
  return evaluateForwardTest({
    params: {
      definition: input.definition,
      costModel: input.costModel,
      initialCapitalPaise: input.initialCapitalPaise,
      plannedSessions: input.plannedSessions,
      startedOn: input.startedOn,
    },
    series: await loadSeries(input.definition, input.source),
  });
}
