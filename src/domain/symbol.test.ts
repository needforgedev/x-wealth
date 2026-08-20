import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SYMBOL_PATTERN_SQL,
  SymbolError,
  exchangeOf,
  isSymbol,
  qualify,
  tickerOf,
  toSymbol,
} from "./symbol";

describe("validation", () => {
  it("accepts qualified symbols", () => {
    for (const s of ["NSE:RELIANCE", "BSE:RELIANCE", "NSE:TATASTEEL", "NSE:M&M", "NSE:BAJAJ-AUTO"]) {
      expect(isSymbol(s), s).toBe(true);
    }
  });

  it("rejects a bare ticker", () => {
    expect(isSymbol("RELIANCE")).toBe(false);
    expect(() => toSymbol("RELIANCE")).toThrow(SymbolError);
  });

  it("rejects the near-misses", () => {
    for (const s of [
      "nse:reliance", // lowercase
      "NSE: RELIANCE", // space
      "NSE:", // no ticker
      ":RELIANCE", // no exchange
      "N:RELIANCE", // exchange too short
      "EXCHANGE:RELIANCE", // exchange too long
      "NSE:RELIANCE:EQ", // extra segment
      "NSE:RELI ANCE", // internal space
    ]) {
      expect(isSymbol(s), s).toBe(false);
    }
  });

  it("does not silently repair a wrong-shaped symbol", () => {
    // Quietly upcasing would risk binding a trade to the wrong instrument.
    expect(() => toSymbol("nse:reliance")).toThrow(SymbolError);
    expect(() => toSymbol(" NSE:RELIANCE ")).toThrow(SymbolError);
  });
});

describe("parts", () => {
  it("splits exchange and ticker", () => {
    const s = qualify("NSE", "RELIANCE");
    expect(exchangeOf(s)).toBe("NSE");
    expect(tickerOf(s)).toBe("RELIANCE");
  });

  it("treats the same ticker on two exchanges as different instruments", () => {
    expect(qualify("NSE", "RELIANCE")).not.toBe(qualify("BSE", "RELIANCE"));
  });
});

/**
 * Every migration that adds a symbol CHECK. A new one has to be listed here, or
 * the drift tests below silently stop covering it — which is the failure this
 * whole section exists to prevent.
 */
const MIGRATIONS_WITH_SYMBOL_CHECKS = [
  "drizzle/0001_invariant_constraints.sql",
  "drizzle/0006_group_strategy_sharing.sql",
];

function migrationSql(): string {
  return MIGRATIONS_WITH_SYMBOL_CHECKS.map((f) => readFileSync(f, "utf8")).join("\n");
}

describe("SQL drift", () => {
  it("uses the same pattern the database CHECK constraints use", () => {
    const found = [...migrationSql().matchAll(/symbol ~ '([^']+)'/g)].map((m) => m[1]);

    expect(found.length, "expected symbol CHECK constraints in the migrations").toBeGreaterThan(0);
    for (const pattern of found) {
      expect(pattern).toBe(SYMBOL_PATTERN_SQL);
    }
  });

  it("covers every table that stores a symbol", () => {
    const sql = migrationSql();
    for (const table of ["paper_trades", "signals", "portfolio_entries", "market_views"]) {
      expect(sql, `${table} needs a symbol CHECK`).toContain(`"${table}"\n  ADD CONSTRAINT "${table}_symbol_qualified_ck"`);
    }
  });
});
