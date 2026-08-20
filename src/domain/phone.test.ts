import { describe, expect, it } from "vitest";

import { formatPhone, isE164, normalisePhone, supabasePhone } from "./phone";

describe("normalisePhone", () => {
  it("adds +91 to a bare Indian 10-digit number", () => {
    expect(normalisePhone("9757242802")).toBe("+919757242802");
  });

  it("keeps a number that already has a country code", () => {
    expect(normalisePhone("+919757242802")).toBe("+919757242802");
    expect(normalisePhone("919757242802")).toBe("+919757242802");
  });

  it("strips the domestic trunk prefix", () => {
    expect(normalisePhone("09757242802")).toBe("+919757242802");
  });

  it("ignores spaces, dashes and brackets", () => {
    expect(normalisePhone(" 97572-42802 ")).toBe("+919757242802");
    expect(normalisePhone("(97572) 42802")).toBe("+919757242802");
    expect(normalisePhone("+91 97572 42802")).toBe("+919757242802");
  });

  it("honours a different dial code", () => {
    expect(normalisePhone("2015550123", "+1")).toBe("+12015550123");
  });

  it("returns null rather than guessing", () => {
    // Anything we cannot confidently render in E.164 must stop at the form —
    // not become an OTP sent somewhere unintended.
    for (const bad of ["", "   ", "abc", "12345", "+", "+0123456789", "97572428021234567"]) {
      expect(normalisePhone(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("isE164", () => {
  it("accepts valid numbers", () => {
    expect(isE164("+919757242802")).toBe(true);
    expect(isE164("+12015550123")).toBe(true);
  });

  it("rejects a leading zero country code and missing plus", () => {
    expect(isE164("+0919757242802")).toBe(false);
    expect(isE164("919757242802")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("groups Indian numbers for display", () => {
    expect(formatPhone("+919757242802")).toBe("+91 97572 42802");
  });

  it("leaves anything else alone", () => {
    expect(formatPhone("+12015550123")).toBe("+12015550123");
    expect(formatPhone("nonsense")).toBe("nonsense");
  });
});

describe("supabasePhone", () => {
  it("drops the plus, because that is how auth.users stores it", () => {
    expect(supabasePhone("+919757242802")).toBe("919757242802");
  });

  it("round-trips through normalisePhone", () => {
    // The pair has to be lossless: an invitation is matched by comparing a
    // number we stored against one Supabase stored, and a conversion that did
    // not round-trip would silently match nobody.
    for (const e164 of ["+919757242802", "+12015550123", "+442071838750"]) {
      expect(normalisePhone(supabasePhone(e164))).toBe(e164);
    }
  });

  it("is idempotent on a number that already has no plus", () => {
    expect(supabasePhone("919757242802")).toBe("919757242802");
  });
});
