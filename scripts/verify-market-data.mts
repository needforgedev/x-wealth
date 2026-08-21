/**
 * Run the conformance suite against the live `daily_bars` table.
 *
 *   npm run verify-market-data
 *
 * `src/domain/market-data-conformance.ts` is written as a plain function
 * returning violations, rather than as a vitest suite, precisely so it can be
 * pointed at a real database. This is that. The unit tests prove the source
 * behaves against an in-memory store; this proves the same code behaves against
 * the rows actually loaded, which is where a driver returning `numeric` as a
 * float, or an index ordering the wrong way, would show up.
 *
 * Read-only. Exits non-zero on any violation so CI can gate on it.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { conformanceViolations } = await import("@/domain/market-data-conformance");
const { PLACEHOLDER_CALENDAR_2026 } = await import("@/domain/session");
const { isTradeable } = await import("@/domain/market-data");
const { formatPrice } = await import("@/domain/money");
const { liveEndOfDaySource } = await import("@/server/market-data/db-store");

const source = await liveEndOfDaySource({ validateOnRead: true });

console.log(
  `source ${source.metadata.name} · ${source.metadata.adjustment} · ` +
    `calendar ${source.metadata.calendarName} · vintage ${source.metadata.vintage}\n`,
);

const instruments = await source.instruments();
console.log("instruments");
for (const instrument of instruments) {
  console.log(
    `  ${instrument.symbol.padEnd(15)} ${instrument.kind.padEnd(6)} ` +
      `tradeable=${String(isTradeable(instrument)).padEnd(5)} ${instrument.name}`,
  );
}

console.log("\nconformance");
let failed = 0;
for (const instrument of instruments) {
  const violations = await conformanceViolations(source, {
    symbol: instrument.symbol,
    calendar: PLACEHOLDER_CALENDAR_2026,
  });

  if (violations.length === 0) {
    const bars = await source.dailyBars(instrument.symbol, "1900-01-01", "2999-12-31");
    console.log(
      `  ${instrument.symbol.padEnd(15)} PASS  ${String(bars.length).padStart(5)} bars  ` +
        `${bars[0].date} → ${bars[bars.length - 1].date}  ` +
        `last close ${formatPrice(bars[bars.length - 1].close)}`,
    );
  } else {
    failed++;
    console.log(`  ${instrument.symbol.padEnd(15)} FAIL`);
    for (const violation of violations) console.log(`      ${violation}`);
  }
}

console.log(
  failed === 0
    ? `\n✓ ${instruments.length} instruments conform — the engine cannot tell this apart from the fixture`
    : `\n✗ ${failed} of ${instruments.length} instruments violate the contract`,
);

process.exit(failed === 0 ? 0 : 1);
