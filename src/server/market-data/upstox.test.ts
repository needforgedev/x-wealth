import { describe, expect, it } from "vitest";

import { priceFromString } from "../../domain/money";
import { barIssues } from "../../domain/market-data";
import { UpstoxError, candlesToBars, upstoxClient } from "./upstox";

/**
 * Real candles, captured from the live v3 endpoint on 21 Aug 2026.
 *
 * RELIANCE around its 1:1 bonus (ex-bonus 28 Oct 2024). Kept verbatim — wire
 * order (newest first), wire types (JSON numbers), trailing open interest and
 * all. A hand-tidied fixture would test the tidying, not the vendor.
 */
const RELIANCE_AROUND_BONUS = [
  ["2024-11-01T00:00:00+05:30", 1333.05, 1341.95, 1333.0, 1338.65, 2127335, 0],
  ["2024-10-31T00:00:00+05:30", 1340.0, 1343.0, 1326.15, 1332.05, 9331650, 0],
  ["2024-10-30T00:00:00+05:30", 1335.0, 1350.0, 1325.35, 1343.9, 11984423, 0],
  ["2024-10-29T00:00:00+05:30", 1328.1, 1343.2, 1320.3, 1340.0, 12008361, 0],
  ["2024-10-28T00:00:00+05:30", 1337.0, 1353.0, 1322.1, 1334.35, 10824350, 0],
  ["2024-10-25T00:00:00+05:30", 1343.5, 1344.35, 1322.0, 1327.85, 18597496, 0],
] as const;

const candles = () => RELIANCE_AROUND_BONUS.map((c) => [...c]) as never;

describe("candlesToBars", () => {
  it("returns oldest first, whatever order the wire used", () => {
    const bars = candlesToBars(candles());
    expect(bars.map((b) => b.date)).toEqual([
      "2024-10-25",
      "2024-10-28",
      "2024-10-29",
      "2024-10-30",
      "2024-10-31",
      "2024-11-01",
    ]);
  });

  it("converts prices exactly, without going through a float", () => {
    const bars = candlesToBars(candles());
    const first = bars[0];

    // Every price in this fixture happens to survive the naive `x * 10_000`
    // route intact — most do. The next test covers one that does not, which is
    // why the conversion never multiplies at all rather than multiplying and
    // hoping.
    expect(first.open).toBe(priceFromString("1343.50"));
    expect(first.high).toBe(priceFromString("1344.35"));
    expect(first.low).toBe(priceFromString("1322.00"));
    expect(first.close).toBe(priceFromString("1327.85"));
    expect(first.volume).toBe(18_597_496);
  });

  it("holds a value the float route would truncate away", () => {
    // ₹100.07 as a double is a hair under 100.07, so scaling it by 10,000 and
    // truncating loses a tick. Not a contrived number — it is the first such
    // price above ₹100, and there are thousands more.
    const [bar] = candlesToBars([
      ["2024-11-05T00:00:00+05:30", 100.07, 100.07, 100.07, 100.07, 1, 0],
    ] as never);

    expect(bar.close).toBe(1_000_700);
    expect(Math.trunc(100.07 * 10_000)).toBe(1_000_699);
  });

  it("produces bars the domain validator accepts", () => {
    for (const bar of candlesToBars(candles())) {
      expect(barIssues(bar)).toEqual([]);
    }
  });

  /**
   * The reason this file pins the bonus at all.
   *
   * Upstox does not document whether daily history is corporate-action
   * adjusted, and returns no field saying so. It is — established by
   * experiment. If they ever switch to raw prices, the close on the ex-bonus
   * date roughly halves against the session before it, and every backtest
   * spanning that date silently reads a 50% loss that never happened. This
   * asserts the shape of the truth we depend on, so the switch breaks a test.
   */
  it("shows the adjusted series has no gap across a 1:1 bonus", () => {
    const bars = candlesToBars(candles());
    const before = bars.find((b) => b.date === "2024-10-25")!;
    const exBonus = bars.find((b) => b.date === "2024-10-28")!;

    const move = Math.abs(exBonus.close / before.close - 1);
    expect(move).toBeLessThan(0.1);
  });

  it("rejects a candle that is not a whole number of shares", () => {
    expect(() =>
      candlesToBars([["2024-10-25T00:00:00+05:30", 1, 1, 1, 1, 1.5, 0]] as never),
    ).toThrow(UpstoxError);
  });

  it("rejects a truncated candle rather than reading undefined as a price", () => {
    expect(() => candlesToBars([["2024-10-25T00:00:00+05:30", 1, 1]] as never)).toThrow(
      UpstoxError,
    );
  });

  it("rejects an unparseable timestamp", () => {
    expect(() => candlesToBars([["not-a-date", 1, 1, 1, 1, 1, 0]] as never)).toThrow(UpstoxError);
  });

  /**
   * Upstox stamps daily candles at IST midnight. A source that started sending
   * the same instant as UTC would shift every date back a day, and no
   * downstream check would notice — the series stays ordered, contiguous and
   * plausible, just wrong by one session.
   */
  it("reads the date in IST, not wherever the process happens to be", () => {
    const [ist] = candlesToBars([
      ["2024-10-28T00:00:00+05:30", 1, 1, 1, 1, 1, 0],
    ] as never);
    expect(ist.date).toBe("2024-10-28");

    const [utcSameInstant] = candlesToBars([
      ["2024-10-27T18:30:00+00:00", 1, 1, 1, 1, 1, 0],
    ] as never);
    expect(utcSameInstant.date).toBe("2024-10-28");
  });
});

describe("upstoxClient", () => {
  const ok = (body: unknown) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  });

  it("encodes the pipe in an instrument key and puts dates newest-first in the path", async () => {
    let seen = "";
    const client = upstoxClient({
      accessToken: "test-token",
      fetch: async (url) => {
        seen = url;
        return ok({ data: { candles: [] } });
      },
    });

    await client.dailyCandles("NSE_EQ|INE002A01018", "2021-08-21", "2026-08-21");

    expect(seen).toContain("NSE_EQ%7CINE002A01018");
    expect(seen).not.toContain("NSE_EQ|INE002A01018");
    // to before from — the vendor's ordering, easy to transpose and invisible
    // if you do, because it returns a valid-looking empty result.
    expect(seen).toContain("/days/1/2026-08-21/2021-08-21");
  });

  it("sends the token as a bearer header", async () => {
    let headers: Record<string, string> | undefined;
    const client = upstoxClient({
      accessToken: "test-token",
      fetch: async (_url, init) => {
        headers = init?.headers;
        return ok({ data: { candles: [] } });
      },
    });

    await client.dailyCandles("NSE_EQ|X", "2026-01-01", "2026-01-02");
    expect(headers?.Authorization).toBe("Bearer test-token");
  });

  it("refuses a backwards range before spending a request on it", async () => {
    const client = upstoxClient({
      accessToken: "test-token",
      fetch: async () => {
        throw new Error("should not have been called");
      },
    });

    await expect(client.dailyCandles("NSE_EQ|X", "2026-08-21", "2026-01-01")).rejects.toThrow(
      /backwards/,
    );
  });

  it("surfaces the vendor's own error code, not just the status", async () => {
    const client = upstoxClient({
      accessToken: "test-token",
      fetch: async () => ({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            status: "error",
            errors: [
              {
                errorCode: "UDAPI1149",
                message: "This API is available exclusively with an Upstox Plus plan subscription.",
              },
            ],
          }),
      }),
    });

    // A plan restriction and an expired token are both 401 and mean entirely
    // different things to whoever is reading the log.
    await expect(client.dailyCandles("NSE_FO|1", "2026-01-01", "2026-01-02")).rejects.toThrow(
      /UDAPI1149/,
    );
  });

  it("treats a body with no candles as an error, not as an empty series", async () => {
    const client = upstoxClient({
      accessToken: "test-token",
      fetch: async () => ok({ status: "success", data: {} }),
    });

    await expect(client.dailyCandles("NSE_EQ|X", "2026-01-01", "2026-01-02")).rejects.toThrow(
      /no data.candles/,
    );
  });

  it("requires a token", () => {
    expect(() => upstoxClient({ accessToken: "  " })).toThrow(UpstoxError);
  });
});
