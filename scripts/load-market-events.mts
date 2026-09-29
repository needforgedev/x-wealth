/**
 * Load market events into `market_events`. `plan.md` W16-06.
 *
 *   npm run load-market-events              # curated macro dates (no key needed)
 *   npm run load-market-events -- --corp    # + IndianAPI corporate actions
 *
 * Idempotent: re-running inserts only what is not already recorded, and a
 * vendor's revised date lands as a new row (append-only, W16-04). Safe to run
 * on a schedule beside the evening market-data load.
 *
 * The curated source needs nothing. The `--corp` source needs `INDIA_STOCK_API`
 * and has **not** been smoke-tested against the live endpoint — treat its first
 * run as the smoke test (like the Upstox adapter's first run was).
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { db } = await import("@/db");
const { curatedMacroEvents, loadMarketEvents } = await import("@/server/market-data/events");
const { indianApiCorporateActions } = await import("@/server/market-data/indianapi");
const { loadCatalogue } = await import("@/server/market-data/catalogue");

const withCorp = process.argv.includes("--corp");

const macro = await loadMarketEvents(curatedMacroEvents(), db());
console.log(`curated macro: +${macro.inserted} inserted, ${macro.skipped} already present`);

if (withCorp) {
  const key = process.env.INDIA_STOCK_API;
  if (!key) {
    console.error("INDIA_STOCK_API is not set — cannot load corporate actions.");
    process.exit(1);
  }
  const catalogue = await loadCatalogue();
  const symbols = catalogue.filter((c) => c.tradeable).map((c) => c.symbol);
  const corp = await loadMarketEvents(
    indianApiCorporateActions({ apiKey: key, symbols }),
    db(),
  );
  console.log(`corporate actions: +${corp.inserted} inserted, ${corp.skipped} already present`);
}

console.log("done");
process.exit(0);
