import { inArray, isNull, or, type SQL } from "drizzle-orm";

import type { Database } from "@/db";
import { marketEvents } from "@/db/schema";
import { MARKET_EVENT_TYPES, type MarketEvent, type MarketEventType } from "@/domain/events";
import type { IsoDate } from "@/domain/session";

/**
 * Loading market events. `plan.md` W16-06, `CLAUDE.md` §7.4.
 *
 * The engine reads events; this is how they get there. Two rules shape it, and
 * both come from `market_events` being append-only:
 *
 *   **Insert-if-new, never update.** Re-running a loader must be a no-op, so it
 *   skips any row already present. A row's identity is its
 *   type+symbol+date+knownOn+confirmed — change any of those and it is a
 *   different fact, not an edit of the old one.
 *
 *   **A revised date is a new row.** When a vendor moves an earnings date, the
 *   new row carries a later `knownOn`; the old row stays, because a backtest
 *   over the period the old date was public must keep seeing it (W16-04). The
 *   evaluators already pick the right one per session, so the loader just adds.
 */

/** What a source hands back — a domain event plus its provenance for the row. */
export type LoadableEvent = MarketEvent & { readonly source: string };

/** A place events come from — a vendor adapter, or a curated list. */
export interface MarketEventSource {
  readonly name: string;
  fetch(): Promise<readonly LoadableEvent[]>;
}

/**
 * A row's identity. Change any part and it is a different fact, not an edit —
 * which is why a revised date (new `knownOn`) is never a duplicate.
 */
export const eventKey = (e: {
  eventType: string;
  symbol: string | null;
  eventDate: IsoDate;
  knownOn: IsoDate;
  confirmed: boolean;
}) => `${e.eventType}|${e.symbol ?? ""}|${e.eventDate}|${e.knownOn}|${e.confirmed}`;

/**
 * The events worth inserting: those not already present, deduped within the
 * batch. Pure, so the idempotency rule that matters — re-runs insert nothing, a
 * revision inserts one new row — is testable without a database.
 */
export function selectFreshEvents<T extends Parameters<typeof eventKey>[0]>(
  events: readonly T[],
  existingKeys: ReadonlySet<string>,
): T[] {
  const seen = new Set(existingKeys);
  const fresh: T[] = [];
  for (const e of events) {
    const key = eventKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(e);
  }
  return fresh;
}

export type LoadResult = { readonly inserted: number; readonly skipped: number };

type Executor = Database;

/**
 * Insert every event the source returns that is not already recorded.
 *
 * Idempotent by the natural key above, so a second run inserts nothing. The
 * CHECKs in migration `0018` still guard each row — scope-matches-type,
 * knownOn ≤ eventDate — so a malformed event from a vendor is refused at the
 * database rather than trusted here.
 */
export async function loadMarketEvents(
  source: MarketEventSource,
  db: Executor,
): Promise<LoadResult> {
  const events = await source.fetch();
  if (events.length === 0) return { inserted: 0, skipped: 0 };

  // Only the rows this batch could collide with, so the check stays small:
  // the symbols it names, plus the market-wide (null-symbol) rows if it has any.
  const symbols = [...new Set(events.map((e) => e.symbol).filter((s): s is string => s !== null))];
  const hasMarketWide = events.some((e) => e.symbol === null);
  const predicates: SQL[] = [];
  if (symbols.length > 0) predicates.push(inArray(marketEvents.symbol, symbols));
  if (hasMarketWide) predicates.push(isNull(marketEvents.symbol));

  const existing = await db
    .select({
      eventType: marketEvents.eventType,
      symbol: marketEvents.symbol,
      eventDate: marketEvents.eventDate,
      knownOn: marketEvents.knownOn,
      confirmed: marketEvents.confirmed,
    })
    .from(marketEvents)
    .where(predicates.length === 1 ? predicates[0] : or(...predicates));

  const existingKeys = new Set(
    existing.map((e) =>
      eventKey({ ...e, eventDate: e.eventDate as IsoDate, knownOn: e.knownOn as IsoDate }),
    ),
  );
  const fresh = selectFreshEvents(events, existingKeys);
  if (fresh.length === 0) return { inserted: 0, skipped: events.length };

  await db.insert(marketEvents).values(
    fresh.map((e) => ({
      eventType: e.eventType,
      symbol: e.symbol,
      eventDate: e.eventDate,
      knownOn: e.knownOn,
      confirmed: e.confirmed,
      source: e.source,
    })),
  );

  return { inserted: fresh.length, skipped: events.length - fresh.length };
}

// ---------------------------------------------------------------------------
// Curated macro events — RBI policy, Budget, CPI/IIP
// ---------------------------------------------------------------------------

/**
 * Market-wide dates that no vendor endpoint carries cleanly, from published
 * circulars. Hand-entered because that is the honest source — the RBI's MPC
 * calendar and the Budget date are announcements, not data, and inventing them
 * from memory is exactly what `known_on` exists to prevent.
 *
 * `knownOn` is the date the schedule was published, always well before the
 * event. All are `confirmed: true` — these are calendar commitments, unlike an
 * earnings date a company may still move.
 *
 * **Extend this from the circular, never from recall.** An undated guess is a
 * lookahead bug that stays plausible.
 */
const CURATED_MACRO: ReadonlyArray<{
  type: MarketEventType;
  eventDate: IsoDate;
  knownOn: IsoDate;
  source: string;
}> = [
  // RBI Monetary Policy Committee outcomes, from the RBI's published 2026 calendar.
  { type: "RBI_POLICY", eventDate: "2026-02-06", knownOn: "2025-12-01", source: "circular:RBI-MPC-2026" },
  { type: "RBI_POLICY", eventDate: "2026-04-08", knownOn: "2025-12-01", source: "circular:RBI-MPC-2026" },
  { type: "RBI_POLICY", eventDate: "2026-06-05", knownOn: "2025-12-01", source: "circular:RBI-MPC-2026" },
  { type: "RBI_POLICY", eventDate: "2026-08-05", knownOn: "2025-12-01", source: "circular:RBI-MPC-2026" },
  { type: "RBI_POLICY", eventDate: "2026-10-07", knownOn: "2025-12-01", source: "circular:RBI-MPC-2026" },
  { type: "RBI_POLICY", eventDate: "2026-12-04", knownOn: "2025-12-01", source: "circular:RBI-MPC-2026" },
  // Union Budget — presented 1 February, a fixed constitutional convention.
  { type: "BUDGET", eventDate: "2026-02-01", knownOn: "2025-12-01", source: "circular:Union-Budget-2026" },
];

export function curatedMacroEvents(): MarketEventSource {
  return {
    name: "curated:macro",
    async fetch() {
      return CURATED_MACRO.map((e) => ({
        eventType: e.type,
        symbol: null,
        eventDate: e.eventDate,
        knownOn: e.knownOn,
        confirmed: true,
        source: e.source,
      }));
    },
  };
}

export { MARKET_EVENT_TYPES };
