import { seriesIssues, type MarketDataSource } from "./market-data";
import { WEEKENDS_ONLY, type IsoDate, type TradingCalendar } from "./session";
import { isSymbol, toSymbol } from "./symbol";

/**
 * The contract every `MarketDataSource` has to satisfy.
 *
 * `plan.md` W3-08 asks for "a conformance suite every implementation must
 * pass, so the engine genuinely cannot tell them apart". That is the whole
 * bet of the interface: if a fixture and a real end-of-day feed can differ in
 * ordering, in whether a range is inclusive, or in what an unknown symbol
 * does, then swapping them changes results and §9's promise is empty.
 *
 * Written as a function returning violations rather than as a vitest suite, so
 * `src/` carries no dependency on a test framework and a future implementation
 * can run it from anywhere — including against a live database in CI.
 *
 * Returns an empty array when the source conforms.
 */
export async function conformanceViolations(
  source: MarketDataSource,
  options: { symbol: string; unknownSymbol?: string; calendar?: TradingCalendar },
): Promise<string[]> {
  const violations: string[] = [];
  const calendar = options.calendar ?? WEEKENDS_ONLY;
  const note = (message: string) => violations.push(message);

  if (!isSymbol(options.symbol)) {
    return [`the symbol under test, "${options.symbol}", is not exchange-qualified`];
  }
  const symbol = toSymbol(options.symbol);

  // --- metadata -----------------------------------------------------------
  const { metadata } = source;
  if (!metadata.name.trim()) note("metadata.name is empty");
  if (metadata.adjustment !== "ADJUSTED" && metadata.adjustment !== "UNADJUSTED") {
    note(`metadata.adjustment is "${metadata.adjustment}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.vintage)) {
    note(`metadata.vintage is not a date: "${metadata.vintage}"`);
  }
  if (!metadata.calendarName.trim()) note("metadata.calendarName is empty");

  // --- instruments --------------------------------------------------------
  const instruments = await source.instruments();
  for (const instrument of instruments) {
    if (!isSymbol(instrument.symbol)) note(`instrument symbol "${instrument.symbol}" is unqualified`);
    if (!Number.isInteger(instrument.lotSize) || instrument.lotSize < 1) {
      note(`${instrument.symbol}: lotSize must be a positive whole number`);
    }
    if (!Number.isInteger(instrument.tickSize) || instrument.tickSize <= 0) {
      note(`${instrument.symbol}: tickSize must be a positive whole number of ticks`);
    }
    if (instrument.kind !== "EQUITY" && instrument.kind !== "INDEX") {
      note(`${instrument.symbol}: kind is "${instrument.kind}"`);
    }
  }
  if (!instruments.some((i) => i.symbol === symbol)) {
    note(`${symbol} has bars but is missing from instruments()`);
  }

  // --- the series itself --------------------------------------------------
  const WIDE_FROM: IsoDate = "1900-01-01";
  const WIDE_TO: IsoDate = "2999-12-31";
  const all = await source.dailyBars(symbol, WIDE_FROM, WIDE_TO);

  if (all.length === 0) return [...violations, `${symbol} returned no bars at all`];

  for (const issue of seriesIssues(all, calendar)) note(`series: ${issue}`);

  // --- range semantics ----------------------------------------------------
  //
  // Both ends inclusive. An implementation that treats `to` as exclusive drops
  // the final session of every backtest, which is invisible in the output and
  // shifts every metric.
  const first = all[0];
  const last = all[all.length - 1];

  const exact = await source.dailyBars(symbol, first.date, last.date);
  if (exact.length !== all.length) {
    note(`asking for exactly [${first.date}, ${last.date}] returned ${exact.length} of ${all.length} bars`);
  }

  const single = await source.dailyBars(symbol, first.date, first.date);
  if (single.length !== 1 || single[0]?.date !== first.date) {
    note(`a single-day range on ${first.date} returned ${single.length} bars`);
  }

  const beforeAll = await source.dailyBars(symbol, WIDE_FROM, "1900-01-02");
  if (beforeAll.length !== 0) note("a range entirely before the series returned bars");

  if (all.length > 1) {
    const trimmed = await source.dailyBars(symbol, all[1].date, last.date);
    if (trimmed.length !== all.length - 1) {
      note(`trimming the first session returned ${trimmed.length}, expected ${all.length - 1}`);
    }
  }

  // --- latestBar ----------------------------------------------------------
  const latest = await source.latestBar(symbol);
  if (latest?.date !== last.date) {
    note(`latestBar returned ${latest?.date ?? "null"}, expected ${last.date}`);
  }

  // --- failure modes ------------------------------------------------------
  //
  // A backwards range and an unknown symbol must both raise. Returning an
  // empty array for either turns a caller's mistake into a plausible
  // zero-trade result, which is the failure this product exists to prevent.
  try {
    await source.dailyBars(symbol, last.date, first.date);
    if (last.date !== first.date) note("a backwards range was accepted instead of throwing");
  } catch {
    // expected
  }

  const unknown = options.unknownSymbol ?? "NSE:NOSUCHTICKER";
  try {
    await source.dailyBars(toSymbol(unknown), WIDE_FROM, WIDE_TO);
    note(`an unknown symbol (${unknown}) returned instead of throwing`);
  } catch {
    // expected
  }

  return violations;
}
