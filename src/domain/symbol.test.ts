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

describe("SQL drift", () => {
  it("uses the same pattern the database CHECK constraints use", () => {
    const sql = readFileSync("drizzle/0001_invariant_constraints.sql", "utf8");
    const found = [...sql.matchAll(/symbol ~ '([^']+)'/g)].map((m) => m[1]);

    expect(found.length, "expected symbol CHECK constraints in the migration").toBeGreaterThan(0);
    for (const pattern of found) {
      expect(pattern).toBe(SYMBOL_PATTERN_SQL);
    }
  });

  it("covers every table that stores a symbol", () => {
    const sql = readFileSync("drizzle/0001_invariant_constraints.sql", "utf8");
    for (const table of ["paper_trades", "signals", "portfolio_entries"]) {
      expect(sql, `${table} needs a symbol CHECK`).toContain(`"${table}"\n  ADD CONSTRAINT "${table}_symbol_qualified_ck"`);
    }
  });
});
