/**
 * Backfill daily bars for the loaded universe.
 *
 *   npm run load-market-data                    # five years, all six instruments
 *   npm run load-market-data -- --years 10
 *   npm run load-market-data -- --symbol NSE:RELIANCE
 *
 * The only thing in this codebase that talks to Upstox. Everything else reads
 * `daily_bars`, which is what makes a backtest reproducible: re-running one
 * against a live endpoint would re-pull whatever the vendor holds today, so the
 * same strategy over the same dates could quietly return a different number.
 *
 * Idempotent. Re-running upserts and moves `source_vintage` forward, which is
 * the correct behaviour when a vendor restates history — the run that already
 * happened keeps describing what it saw, in its own `methodology`.
 *
 * Run through `tsx`, not bare node: it resolves the `@/` alias and the
 * extensionless imports the rest of `src` uses, so the loader can import the
 * very same conversion the app does. A loader with its own private idea of how
 * a price becomes ticks is how the table and the engine end up disagreeing.
 */
import { config } from "dotenv";
import postgres from "postgres";

import { priceToString } from "@/domain/money";
import { assertValidSeries } from "@/domain/market-data";
import { PLACEHOLDER_CALENDAR_2026 } from "@/domain/session";
import { UNIVERSE, type UniverseEntry } from "@/server/market-data/universe";
import {
  MAX_DAILY_RANGE_YEARS,
  UPSTOX_DAILY_ADJUSTMENT,
  UPSTOX_SOURCE,
  upstoxClient,
} from "@/server/market-data/upstox";

config({ path: ".env.local" });

// --- arguments --------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};

const years = Number(flag("years") ?? 5);
if (!Number.isInteger(years) || years < 1) {
  console.error("--years must be a whole number of years, at least 1");
  process.exit(1);
}

const onlySymbol = flag("symbol");
const targets: UniverseEntry[] = onlySymbol
  ? UNIVERSE.filter((i) => i.symbol === onlySymbol)
  : [...UNIVERSE];

if (targets.length === 0) {
  console.error(
    `--symbol ${onlySymbol} is not in the universe. Known: ${UNIVERSE.map((i) => i.symbol).join(", ")}`,
  );
  process.exit(1);
}

// --- credentials ------------------------------------------------------------

const token = process.env.UPSTOX_API_TOKEN;
if (!token) {
  console.error(
    "UPSTOX_API_TOKEN is not set in .env.local.\n" +
      "Generate a free Analytics Token (1-year, read-only) from the Upstox\n" +
      "developer dashboard under Apps → Analytics.",
  );
  process.exit(1);
}

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set in .env.local (session pooler, port 5432).");
  process.exit(1);
}

// --- dates ------------------------------------------------------------------

/**
 * Today in IST.
 *
 * Not the host's local date. A loader run from a machine in another timezone
 * would otherwise ask for a session that has not happened yet, or stop one
 * short — and an off-by-one at the end of a series is invisible in the output.
 */
function istToday(): string {
  return new Date(Date.now() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 10);
}

/**
 * Same calendar date, `n` years earlier.
 *
 * 29 February has no counterpart in a common year, so it clamps to the 28th
 * rather than producing "2015-02-29" — a string Postgres and `Date.parse` both
 * reject, on the one day in four years anyone would find out.
 */
function minusYears(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const year = y - n;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Split a range into chunks the vendor will accept.
 *
 * Upstox caps a daily request at one decade and rejects anything wider outright
 * with `UDAPI1148` — it does not truncate, so an over-wide ask returns no data
 * at all rather than partial data. Chunking here means a ten-year-plus backfill
 * is a loop, not a surprise.
 */
function chunks(from: string, to: string): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  let end = to;
  while (end > from) {
    const start = minusYears(end, MAX_DAILY_RANGE_YEARS);
    out.push({ from: start > from ? start : from, to: end });
    if (start <= from) break;
    // Step back a day so the chunks do not overlap on their shared boundary.
    const previous = new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000);
    end = previous.toISOString().slice(0, 10);
  }
  return out.reverse();
}

// --- load -------------------------------------------------------------------

const to = istToday();
const from = minusYears(to, years);
const vintage = to;

const client = upstoxClient({ accessToken: token });
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 20, connect_timeout: 30 });

console.log(`loading ${targets.length} instrument(s), ${from} → ${to}`);
console.log(`source ${UPSTOX_SOURCE} · adjustment ${UPSTOX_DAILY_ADJUSTMENT} · vintage ${vintage}\n`);

let failures = 0;

try {
  for (const entry of targets) {
    process.stdout.write(`  ${entry.symbol.padEnd(16)}`);

    try {
      // The instrument first: `daily_bars.symbol` is a foreign key, so a bar
      // cannot land before the thing it belongs to exists.
      await sql`
        insert into instruments (symbol, name, kind, lot_size, tick_size, vendor, vendor_key, isin)
        values (${entry.symbol}, ${entry.name}, ${entry.kind}, ${entry.lotSize},
                ${priceToString(entry.tickSize)}, ${entry.vendor}, ${entry.vendorKey}, ${entry.isin})
        on conflict (symbol) do update set
          name = excluded.name,
          kind = excluded.kind,
          lot_size = excluded.lot_size,
          tick_size = excluded.tick_size,
          vendor = excluded.vendor,
          vendor_key = excluded.vendor_key,
          isin = excluded.isin,
          updated_at = now()`;

      const bars = [];
      for (const window of chunks(from, to)) {
        bars.push(...(await client.dailyCandles(entry.vendorKey, window.from, window.to)));
      }

      if (bars.length === 0) {
        console.log("no bars returned");
        failures++;
        continue;
      }

      // Validate before writing, not after. The table's CHECKs would catch a
      // corrupt row too, but they cannot say *which* rule a series broke, and
      // ordering and duplicates are not expressible as a row constraint at all.
      assertValidSeries(bars, PLACEHOLDER_CALENDAR_2026);

      const rows = bars.map((bar) => ({
        symbol: entry.symbol,
        date: bar.date,
        open: priceToString(bar.open),
        high: priceToString(bar.high),
        low: priceToString(bar.low),
        close: priceToString(bar.close),
        volume: bar.volume,
        source: UPSTOX_SOURCE,
        adjustment: UPSTOX_DAILY_ADJUSTMENT,
        source_vintage: vintage,
      }));

      // One statement per instrument. Five years is ~1,240 rows, comfortably
      // inside a single insert, and it keeps a partial series from landing.
      await sql`
        insert into daily_bars ${sql(rows)}
        on conflict (symbol, date) do update set
          open = excluded.open,
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          volume = excluded.volume,
          source = excluded.source,
          adjustment = excluded.adjustment,
          source_vintage = excluded.source_vintage,
          ingested_at = now()`;

      console.log(`${String(bars.length).padStart(5)} bars   ${bars[0].date} → ${bars[bars.length - 1].date}`);
    } catch (error) {
      failures++;
      console.log(`FAILED — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const [summary] = await sql`
    select count(*)::int as bars, count(distinct symbol)::int as symbols from daily_bars`;
  console.log(`\ndaily_bars now holds ${summary.bars} bars across ${summary.symbols} instruments`);
} finally {
  await sql.end();
}

// A partial backfill is not a success. Exiting non-zero means a scheduled run
// surfaces rather than logging a failure into a stream nobody reads.
process.exit(failures > 0 ? 1 : 0);
