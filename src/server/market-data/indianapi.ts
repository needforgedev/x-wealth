import type { IsoDate } from "@/domain/session";
import type { MarketEventType } from "@/domain/events";

import type { LoadableEvent, MarketEventSource } from "./events";

/**
 * IndianAPI as the corporate-action source. `plan.md` W16-06, `CLAUDE.md` §7.4.
 *
 * IndianAPI is unusable for OHLCV (close-only, weekly past a year — see the
 * vendor findings), and this is the one thing it is good for: it carries
 * bonus, dividend and split actions with their record and ex dates. Upstox's
 * adjusted series already *prices* these correctly; what the engine cannot get
 * from an adjusted series is the *dates*, and "skip entries near ex-dividend"
 * is a dates rule (W3-05).
 *
 * ## `knownOn` is the ex/record date, not today
 *
 * A corporate action is announced before it happens, but the announcement date
 * is not in this feed. Setting `knownOn = eventDate` under-informs the backtest
 * — a rule reacts to the action from the day it happened rather than the day it
 * was announced — which is the safe direction of the W16-04 error: it can only
 * make the strategy miss a signal it might have caught, never catch one it
 * could not have known. If IndianAPI later exposes announcement dates, that is
 * the only line that changes.
 *
 * ## Not verified against the live API
 *
 * The response shape below is the documented one; it has **not** been smoke-
 * tested against the real endpoint (the account is close-only and this is a
 * secondary feed). `parseCorporateActions` is pure and fully tested on
 * fixtures; the HTTP call needs a live run with `INDIA_STOCK_API` before it is
 * trusted, exactly as the Upstox adapter did (W3-09).
 */

const ENDPOINT = "https://stock.indianapi.in/corporate_actions";

/**
 * The real response shape, discovered by smoke-testing the live endpoint
 * (2026-09-29): an object of tabular sections, each `{header, data: rows}`
 * where a row is a string array. Dates are `DD-MM-YYYY`. Kept loose because a
 * vendor reorders columns without warning — the columns are found by header
 * name, never by fixed index.
 */
type Section = { header?: string[] | null; data?: string[][] | null };
export type CorporateActionsResponse = {
  dividends?: Section;
  bonus?: Section;
  splits?: Section;
  board_meetings?: Section;
  rights?: Section;
};

/** `28-10-2024` → `2024-10-28`, or null if it is not a real date. */
function toIso(ddmmyyyy: string | undefined): IsoDate | null {
  const m = ddmmyyyy?.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const iso = `${yyyy}-${mm}-${dd}`;
  return Number.isNaN(Date.parse(iso)) ? null : (iso as IsoDate);
}

/** Column index by header name (case-insensitive contains), or -1. */
function col(header: string[] | null | undefined, name: string): number {
  return (header ?? []).findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
}

/**
 * The sectioned vendor response → loadable events. Pure, so the parsing is
 * testable without the network. Rows without an ex date are dropped rather
 * than guessed — a corporate action with no date is not one the engine can act
 * on. `rights` is ignored: there is no rules primitive for it.
 *
 * `knownOn` is the ex date (and the meeting date for earnings) — the earliest
 * we can honestly claim the fact was public, since this feed carries no
 * announcement date. That under-informs the backtest, the safe direction of
 * the W16-04 error.
 */
export function parseCorporateActions(
  response: CorporateActionsResponse,
  symbol: string,
): LoadableEvent[] {
  const events: LoadableEvent[] = [];
  const push = (type: MarketEventType, date: IsoDate | null) => {
    if (date) {
      events.push({
        eventType: type,
        symbol,
        eventDate: date,
        knownOn: date,
        confirmed: true,
        source: "indianapi:corporate_actions",
      });
    }
  };

  // Dividends, bonus, splits — all carry an "Ex-Date" column.
  for (const [section, type] of [
    [response.dividends, "EX_DIVIDEND"],
    [response.bonus, "BONUS"],
    [response.splits, "SPLIT"],
  ] as const) {
    const ex = col(section?.header, "ex-date");
    for (const row of section?.data ?? []) {
      if (ex >= 0) push(type, toIso(row[ex]));
    }
  }

  // Board meetings called to approve results are the earnings dates. The agenda
  // is freeform, so match on it rather than trusting a column; a meeting about
  // anything else (a fundraise, a dividend declaration) is not an earnings event.
  const bm = response.board_meetings;
  const dateCol = col(bm?.header, "date");
  const agendaCol = col(bm?.header, "agenda");
  for (const row of bm?.data ?? []) {
    const agenda = (agendaCol >= 0 ? row[agendaCol] : "").toLowerCase();
    if (dateCol >= 0 && /financial result|results/.test(agenda)) {
      push("EARNINGS", toIso(row[dateCol]));
    }
  }

  return events;
}

export function indianApiCorporateActions(input: {
  apiKey: string;
  symbols: readonly string[];
  fetchImpl?: typeof fetch;
}): MarketEventSource {
  const doFetch = input.fetchImpl ?? fetch;

  return {
    name: "indianapi:corporate_actions",
    async fetch() {
      const all: LoadableEvent[] = [];
      for (const symbol of input.symbols) {
        // Symbols arrive exchange-qualified (NSE:TCS); the vendor wants the bare
        // name under the `stock_name` param (found via the live 422, not docs).
        const bare = symbol.includes(":") ? symbol.split(":")[1] : symbol;
        const url = `${ENDPOINT}?stock_name=${encodeURIComponent(bare)}`;
        let response: Response;
        try {
          response = await doFetch(url, {
            headers: { "X-Api-Key": input.apiKey },
            signal: AbortSignal.timeout(30_000),
          });
        } catch (cause) {
          throw new Error(`IndianAPI unreachable for ${symbol}: ${String(cause)}`);
        }
        if (!response.ok) {
          throw new Error(`IndianAPI ${response.status} for ${symbol}`);
        }
        const payload = (await response.json().catch(() => null)) as CorporateActionsResponse | null;
        if (!payload || typeof payload !== "object") continue;
        all.push(...parseCorporateActions(payload, symbol));
      }
      return all;
    },
  };
}
