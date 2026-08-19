/**
 * Phone numbers, in E.164.
 *
 * Supabase Auth requires E.164 (`+911234567890`). The built OTP screens collect
 * a bare 10-digit number behind a `+91` selector, so something has to reconcile
 * the two — and it should be here, testable, rather than inside a Server Action
 * where it cannot be exercised without a session.
 *
 * (It also cannot live in the actions file: a `"use server"` module may only
 * export async functions.)
 */

/** E.164: a leading +, a non-zero country code, 8–15 digits total. */
const E164 = /^\+[1-9]\d{7,14}$/;

/** India. The default when a bare 10-digit number is entered. */
export const DEFAULT_DIAL_CODE = "+91";

export function isE164(value: string): boolean {
  return E164.test(value);
}

/**
 * Normalise user input to E.164, or null if it cannot be.
 *
 * Returns null rather than guessing. A number we cannot confidently render in
 * E.164 should stop at the form with a clear message, not become an OTP sent
 * somewhere unintended.
 */
export function normalisePhone(input: string, dialCode = DEFAULT_DIAL_CODE): string | null {
  const stripped = input.replace(/[\s\-()]/g, "");
  if (stripped === "") return null;

  let candidate: string;
  if (stripped.startsWith("+")) {
    candidate = stripped;
  } else if (/^\d{10}$/.test(stripped)) {
    candidate = `${dialCode}${stripped}`;
  } else if (/^0\d{10}$/.test(stripped)) {
    // Indian domestic trunk prefix — 0 then the 10-digit number.
    candidate = `${dialCode}${stripped.slice(1)}`;
  } else if (/^\d{11,15}$/.test(stripped)) {
    // Already includes a country code, just missing the plus.
    candidate = `+${stripped}`;
  } else {
    return null;
  }

  return isE164(candidate) ? candidate : null;
}

/** +919757242802 → +91 97572 42802 */
export function formatPhone(e164: string): string {
  if (!isE164(e164)) return e164;
  if (e164.startsWith("+91") && e164.length === 13) {
    const digits = e164.slice(3);
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return e164;
}
