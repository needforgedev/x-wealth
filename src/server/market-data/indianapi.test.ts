import { describe, expect, it } from "vitest";

import {
  parseCorporateActions,
  indianApiCorporateActions,
  type CorporateActionsResponse,
} from "./indianapi";

/**
 * The parser is pure and covered here against the *real* response shape,
 * captured from the live endpoint on 2026-09-29. The HTTP call is exercised
 * with a fake fetch.
 */

const RESPONSE: CorporateActionsResponse = {
  dividends: {
    header: ["Record Date", "Ex-Date", "Dividend Percentage", "Details"],
    data: [["05-06-2026", "05-06-2026", "60%"]],
  },
  bonus: {
    header: ["Record Date", "Ex-Date", "Ratio"],
    data: [["28-10-2024", "28-10-2024", "1:1"]],
  },
  splits: { header: null, data: [] },
  board_meetings: {
    header: ["Date", "Agenda"],
    data: [
      ["17-07-2026", "...scheduled on 17/07/2026 to consider the unaudited financial results..."],
      ["19-03-2026", "...to consider a proposal for fund raising..."], // not earnings
    ],
  },
  rights: { header: ["Record Date", "Ex-Date", "Ratio", "Premium"], data: [["14-05-2020", "13-05-2020", "1:15", "0"]] },
};

describe("parseCorporateActions", () => {
  it("maps dividends, bonus and results-meetings, converting DD-MM-YYYY to ISO", () => {
    const events = parseCorporateActions(RESPONSE, "NSE:RELIANCE");
    expect(events).toContainEqual({
      eventType: "EX_DIVIDEND", symbol: "NSE:RELIANCE", eventDate: "2026-06-05", knownOn: "2026-06-05", confirmed: true, source: "indianapi:corporate_actions",
    });
    expect(events).toContainEqual({
      eventType: "BONUS", symbol: "NSE:RELIANCE", eventDate: "2024-10-28", knownOn: "2024-10-28", confirmed: true, source: "indianapi:corporate_actions",
    });
    expect(events).toContainEqual(
      expect.objectContaining({ eventType: "EARNINGS", eventDate: "2026-07-17" }),
    );
  });

  it("ignores rights (no primitive), splits with no rows, and non-results meetings", () => {
    const events = parseCorporateActions(RESPONSE, "NSE:RELIANCE");
    expect(events.some((e) => e.eventDate === "2020-05-13")).toBe(false); // the rights ex-date
    expect(events.some((e) => e.eventType === "SPLIT")).toBe(false);
    // The fund-raising board meeting is not an earnings event.
    expect(events.filter((e) => e.eventType === "EARNINGS")).toHaveLength(1);
  });

  it("finds the Ex-Date by header name, not a fixed column", () => {
    const reordered: CorporateActionsResponse = {
      dividends: { header: ["Ex-Date", "Record Date", "Ratio"], data: [["15-10-2026", "16-10-2026", "10%"]] },
    };
    const [e] = parseCorporateActions(reordered, "NSE:TCS");
    expect(e.eventDate).toBe("2026-10-15"); // ex-date column 0, not record-date
  });

  it("drops malformed dates rather than guessing", () => {
    const bad: CorporateActionsResponse = {
      dividends: { header: ["Record Date", "Ex-Date"], data: [["x", "not-a-date"]] },
    };
    expect(parseCorporateActions(bad, "NSE:TCS")).toEqual([]);
  });

  it("knownOn never trails the event date (W16-04)", () => {
    for (const e of parseCorporateActions(RESPONSE, "NSE:RELIANCE")) {
      expect(e.knownOn <= e.eventDate).toBe(true);
    }
  });
});

describe("indianApiCorporateActions", () => {
  it("calls stock_name with the bare symbol and re-qualifies the result", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const source = indianApiCorporateActions({ apiKey: "k", symbols: ["NSE:RELIANCE"], fetchImpl });
    const events = await source.fetch();

    expect(calls[0]).toContain("stock_name=RELIANCE");
    expect(events.every((e) => e.symbol === "NSE:RELIANCE")).toBe(true);
  });

  it("throws on a non-OK response rather than silently loading nothing", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const source = indianApiCorporateActions({ apiKey: "k", symbols: ["NSE:TCS"], fetchImpl });
    await expect(source.fetch()).rejects.toThrow("IndianAPI 500");
  });
});
