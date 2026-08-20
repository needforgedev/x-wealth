import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  LIMITS,
  NOT_FORWARD_TESTED_NOTICE,
  buildDisclosureBlock,
  parseMarketView,
  parseTradeCall,
  type MarketViewDraft,
  type TradeCallDraft,
} from "./signal";

function call(overrides: Partial<TradeCallDraft> = {}): TradeCallDraft {
  return {
    symbol: "NSE:TATASTEEL",
    side: "BUY",
    entryPrice: "345",
    stopLoss: "330",
    exitPrice: "",
    targets: ["", "", ""],
    validFrom: "2026-08-20T10:00",
    validUntil: "",
    rationale: "",
    riskProfile: "MEDIUM",
    ...overrides,
  };
}

function view(overrides: Partial<MarketViewDraft> = {}): MarketViewDraft {
  return { stance: "BULLISH", symbol: "", note: "", ...overrides };
}

/** The field names of every issue, so assertions read as intent not as text. */
function fieldsOf(result: ReturnType<typeof parseTradeCall>): string[] {
  return result.ok ? [] : result.issues.map((i) => i.field);
}

describe("trade call — the stop has to protect", () => {
  it("accepts a buy stopped below the entry", () => {
    expect(parseTradeCall(call()).ok).toBe(true);
  });

  it("rejects a buy stopped above the entry", () => {
    // Almost always the entry and stop typed into each other's boxes. The row
    // would be perfectly valid and the advice incoherent.
    const result = parseTradeCall(call({ entryPrice: "330", stopLoss: "345" }));
    expect(fieldsOf(result)).toContain("stopLoss");
  });

  it("accepts a sell stopped above the entry", () => {
    expect(parseTradeCall(call({ side: "SELL", entryPrice: "345", stopLoss: "360" })).ok).toBe(true);
  });

  it("rejects a sell stopped below the entry", () => {
    const result = parseTradeCall(call({ side: "SELL", entryPrice: "345", stopLoss: "330" }));
    expect(fieldsOf(result)).toContain("stopLoss");
  });

  it("rejects a stop equal to the entry, which can only fire instantly", () => {
    const result = parseTradeCall(call({ entryPrice: "345", stopLoss: "345" }));
    expect(fieldsOf(result)).toContain("stopLoss");
  });
});

describe("trade call — targets run away from the entry, in order", () => {
  it("labels targets by position and drops the blanks", () => {
    const result = parseTradeCall(call({ targets: ["360", "", "400"] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.targets).toEqual([
      { label: "T1", price: "360.0000" },
      { label: "T2", price: "400.0000" },
    ]);
  });

  it("rejects a buy target below the entry", () => {
    const result = parseTradeCall(call({ targets: ["300", "", ""] }));
    expect(fieldsOf(result)).toContain("targets.0");
  });

  it("rejects targets that go backwards", () => {
    const result = parseTradeCall(call({ targets: ["400", "360", ""] }));
    expect(fieldsOf(result)).toContain("targets.1");
  });

  it("reverses the whole rule for a sell", () => {
    const ok = parseTradeCall(
      call({ side: "SELL", entryPrice: "345", stopLoss: "360", targets: ["330", "300", ""] }),
    );
    expect(ok.ok).toBe(true);

    const backwards = parseTradeCall(
      call({ side: "SELL", entryPrice: "345", stopLoss: "360", targets: ["300", "330", ""] }),
    );
    expect(fieldsOf(backwards)).toContain("targets.1");
  });

  it("refuses more targets than the database will store", () => {
    const many = Array.from({ length: LIMITS.targets.max + 1 }, (_, i) => String(400 + i));
    expect(fieldsOf(parseTradeCall(call({ targets: many })))).toContain("targets");
  });
});

describe("trade call — prices and validity", () => {
  it("rejects a price that is not a number", () => {
    expect(fieldsOf(parseTradeCall(call({ entryPrice: "three forty five" })))).toContain(
      "entryPrice",
    );
  });

  it("rejects a price with more precision than the column holds", () => {
    // NUMERIC(18,4). Silently truncating the fifth decimal loses money.
    expect(fieldsOf(parseTradeCall(call({ entryPrice: "345.00001" })))).toContain("entryPrice");
  });

  it("rejects a zero or negative entry", () => {
    expect(fieldsOf(parseTradeCall(call({ entryPrice: "0" })))).toContain("entryPrice");
    expect(fieldsOf(parseTradeCall(call({ entryPrice: "-5" })))).toContain("entryPrice");
  });

  it("keeps the exit on the winning side", () => {
    expect(fieldsOf(parseTradeCall(call({ exitPrice: "300" })))).toContain("exitPrice");
    expect(parseTradeCall(call({ exitPrice: "400" })).ok).toBe(true);
  });

  it("rejects a call that expires before it opens", () => {
    const result = parseTradeCall(
      call({ validFrom: "2026-08-20T10:00", validUntil: "2026-08-19T10:00" }),
    );
    expect(fieldsOf(result)).toContain("validUntil");
  });

  it("treats a blank validUntil as open-ended rather than as an error", () => {
    const result = parseTradeCall(call({ validUntil: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.validUntil).toBeNull();
  });

  it("uppercases the symbol but will not repair a bare ticker", () => {
    const ok = parseTradeCall(call({ symbol: "nse:tatasteel" }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.symbol).toBe("NSE:TATASTEEL");

    expect(fieldsOf(parseTradeCall(call({ symbol: "TATASTEEL" })))).toContain("symbol");
  });
});

describe("market view", () => {
  it("accepts a stance with no instrument and no note", () => {
    const result = parseMarketView(view());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.symbol).toBeNull();
    expect(result.value.note).toBeNull();
  });

  it("stores a whitespace-only note as nothing, so absent has one meaning", () => {
    const result = parseMarketView(view({ note: "   " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.note).toBeNull();
  });

  it("enforces the cap that keeps a view from becoming a chat message", () => {
    expect(parseMarketView(view({ note: "x".repeat(LIMITS.note.max) })).ok).toBe(true);
    expect(parseMarketView(view({ note: "x".repeat(LIMITS.note.max + 1) })).ok).toBe(false);
  });

  it("still requires a qualified symbol when one is given", () => {
    const result = parseMarketView(view({ symbol: "NIFTY" }));
    expect(result.ok).toBe(false);
  });
});

describe("disclosure", () => {
  const advisor = {
    contactName: "A Sharma",
    firmName: "Sharma Research",
    sebiRegistrationNo: "INH000001234",
  };

  it("names the advisor and their registration", () => {
    const text = buildDisclosureBlock(advisor, { forwardTested: true });
    expect(text).toContain("Sharma Research");
    expect(text).toContain("INH000001234");
  });

  it("records the missing forward test in the text itself, not only in a badge", () => {
    // A badge is a rendering decision a later change can drop. This sentence is
    // stored on an append-only row and survives.
    expect(buildDisclosureBlock(advisor, { forwardTested: false })).toContain(
      NOT_FORWARD_TESTED_NOTICE,
    );
    expect(buildDisclosureBlock(advisor, { forwardTested: true })).not.toContain(
      NOT_FORWARD_TESTED_NOTICE,
    );
  });

  it("still produces a disclosure when the advisor record is thin", () => {
    const text = buildDisclosureBlock(
      { contactName: null, firmName: null, sebiRegistrationNo: null },
      { forwardTested: true },
    );
    expect(text).toContain("Research Analyst");
    expect(text).not.toContain("null");
  });
});

describe("SQL drift", () => {
  const migration = readFileSync("drizzle/0006_group_strategy_sharing.sql", "utf8");

  it("caps a note at the same length the database does", () => {
    expect(migration).toContain(`length(note) BETWEEN 1 AND ${LIMITS.note.max}`);
  });

  it("caps targets at the same count the database does", () => {
    expect(migration).toContain(`jsonb_array_length(targets) <= ${LIMITS.targets.max}`);
  });
});
