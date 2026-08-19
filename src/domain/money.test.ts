import { describe, expect, it } from "vitest";

import {
  MoneyError,
  addPaise,
  formatPaise,
  formatPrice,
  paise,
  paiseFromRupees,
  paiseFromString,
  paiseToString,
  percentOf,
  positionValue,
  priceFromString,
  priceToString,
  roundHalfAwayFromZero,
  subPaise,
} from "./money";

describe("the float trap", () => {
  it("does not lose a paisa the way floats do", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float arithmetic.
    const sum = addPaise(paiseFromString("0.10"), paiseFromString("0.20"));
    expect(sum).toBe(30);
    expect(paiseToString(sum)).toBe("0.30");
  });

  it("parses a value that float parsing gets wrong", () => {
    // parseFloat("1234.565") * 1000 === 1234564.9999999998
    expect(priceFromString("1234.5650")).toBe(12345650);
    expect(priceToString(priceFromString("1234.5650"))).toBe("1234.5650");
  });

  it("survives a long chain of additions without drift", () => {
    let total = paise(0);
    for (let i = 0; i < 10_000; i++) total = addPaise(total, paiseFromString("0.01"));
    expect(total).toBe(10_000);
    expect(paiseToString(total)).toBe("100.00");
  });

  it("refuses a fractional rupee number instead of silently converting it", () => {
    expect(() => paiseFromRupees(10.5)).toThrow(MoneyError);
  });

  it("refuses more precision than it can represent rather than truncating", () => {
    expect(() => paiseFromString("1.005")).toThrow(MoneyError);
    expect(() => priceFromString("1.00005")).toThrow(MoneyError);
  });
});

describe("parsing", () => {
  it("reads whole and fractional rupees", () => {
    expect(paiseFromString("0")).toBe(0);
    expect(paiseFromString("1")).toBe(100);
    expect(paiseFromString("1.5")).toBe(150);
    expect(paiseFromString("1.05")).toBe(105);
    expect(paiseFromString("2500.00")).toBe(250_000);
  });

  it("reads negatives", () => {
    expect(paiseFromString("-1.05")).toBe(-105);
    expect(paiseToString(paiseFromString("-1.05"))).toBe("-1.05");
  });

  it("tolerates surrounding whitespace", () => {
    expect(paiseFromString("  12.30 ")).toBe(1230);
  });

  it("rejects anything that is not a plain decimal", () => {
    for (const bad of ["", "abc", "1,234.00", "₹12", "1.2.3", "1e3", "+1", "."]) {
      expect(() => paiseFromString(bad), bad).toThrow(MoneyError);
    }
  });
});

describe("rounding", () => {
  it("rounds half away from zero, symmetrically", () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
    expect(roundHalfAwayFromZero(-2.4)).toBe(-2);
  });

  it("treats a gain and an equal loss identically", () => {
    const gain = percentOf(paiseFromString("100.05"), 50);
    const loss = percentOf(paiseFromString("-100.05"), 50);
    expect(gain).toBe(-loss);
  });
});

describe("percentOf", () => {
  it("computes statutory-charge style percentages", () => {
    // STT at 0.1% of ₹1,00,000
    expect(percentOf(paiseFromRupees(100_000), 0.1)).toBe(paiseFromRupees(100));
    // GST at 18% of ₹20
    expect(percentOf(paiseFromRupees(20), 18)).toBe(360);
  });

  it("rounds to a whole paisa", () => {
    // 0.00297% of ₹1 = 0.00297 paise -> 0
    expect(percentOf(paiseFromRupees(1), 0.00297)).toBe(0);
    // ...of ₹10,000 = 29.7 paise -> 30
    expect(percentOf(paiseFromRupees(10_000), 0.00297)).toBe(30);
  });
});

describe("positionValue", () => {
  it("multiplies a price by a quantity into money", () => {
    expect(positionValue(priceFromString("2500.0000"), 10)).toBe(paiseFromRupees(25_000));
    expect(positionValue(priceFromString("157.9400"), 123)).toBe(paiseFromString("19426.62"));
  });

  it("rounds a sub-paisa result once", () => {
    // 0.0001 * 1 = 0.0001 rupees = 0.01 paise -> 0
    expect(positionValue(priceFromString("0.0001"), 1)).toBe(0);
    // 0.0001 * 10000 = 1 rupee
    expect(positionValue(priceFromString("0.0001"), 10_000)).toBe(100);
  });

  it("requires a whole quantity — there are no fractional shares here", () => {
    expect(() => positionValue(priceFromString("100.0000"), 1.5)).toThrow(MoneyError);
  });
});

describe("formatting", () => {
  it("groups in the Indian system", () => {
    expect(formatPaise(paiseFromRupees(123_456))).toBe("₹1,23,456.00");
    expect(formatPaise(paiseFromRupees(1_00_00_000))).toBe("₹1,00,00,000.00");
    expect(formatPaise(paiseFromRupees(999))).toBe("₹999.00");
  });

  it("can drop the paise for headline figures", () => {
    expect(formatPaise(paiseFromString("1234.56"), { withPaise: false })).toBe("₹1,234");
  });

  it("renders negatives with the sign outside the symbol", () => {
    expect(formatPaise(paiseFromString("-1234.56"))).toBe("-₹1,234.56");
  });

  it("shows prices at two decimals and carries correctly", () => {
    expect(formatPrice(priceFromString("2500.0000"))).toBe("₹2,500.00");
    expect(formatPrice(priceFromString("157.9449"))).toBe("₹157.94");
    // .9950 rounds to 1.00 and must carry into the rupees
    expect(formatPrice(priceFromString("99.9950"))).toBe("₹100.00");
  });
});

describe("range guards", () => {
  it("refuses values beyond exact integer arithmetic", () => {
    expect(() => paise(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
    expect(() => paiseFromString("99999999999999999")).toThrow(MoneyError);
  });

  it("handles a realistically large book", () => {
    const crore = paiseFromRupees(10_000_000);
    expect(paiseToString(addPaise(crore, crore))).toBe("20000000.00");
  });
});

describe("subtraction", () => {
  it("is exact", () => {
    expect(subPaise(paiseFromString("100.00"), paiseFromString("33.33"))).toBe(6667);
  });
});
