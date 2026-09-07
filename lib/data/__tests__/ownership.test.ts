import { describe, expect, it } from "vitest";
import {
  latestNamedFlow,
  marketFromTicker,
  namedParties,
  parseIngestBody,
  parseOwnershipRecord,
  pctDelta,
  sortChronological,
} from "../ownership";

describe("ownership ingest", () => {
  it("infers HK vs US from the ticker", () => {
    expect(marketFromTicker("9988.HK")).toBe("HK");
    expect(marketFromTicker("NVDA")).toBe("US");
  });

  it("rejects an unknown signal and accepts a CCASS row", () => {
    expect(parseOwnershipRecord({ ticker: "9988.HK", as_of_date: "2026-09-06" })).toEqual({
      error: expect.stringContaining("signal_type"),
    });
    const row = parseOwnershipRecord({
      ticker: "9988.hk",
      as_of_date: "2026-09-04",
      institutional_pct: 42.5,
      retail_pct: 14.2,
      top_buyers: [{ name: "J.P. Morgan Securities", change_30d: "+1.15%" }],
      signal_type: "INSTITUTIONAL_ACCUMULATION",
    });
    expect(row).toMatchObject({
      ticker: "9988.HK",
      market_type: "HK",
      institutional_pct: 42.5,
      signal_type: "INSTITUTIONAL_ACCUMULATION",
    });
  });

  it("accepts a records array and sorts oldest first", () => {
    const parsed = parseIngestBody({
      records: [
        { ticker: "AAPL", as_of_date: "2026-06-30", signal_type: "NEUTRAL", inst_holding_pct: 68.5 },
        { ticker: "AAPL", as_of_date: "2026-03-31", signal_type: "INSIDER_BULLISH", inst_holding_pct: 67.1, net_insider_usd: 12_000_000 },
      ],
    });
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    const ordered = sortChronological(parsed);
    expect(ordered[0]?.as_of_date).toBe("2026-03-31");
    expect(pctDelta(67.1, 68.5)).toBeCloseTo(1.4, 8);
  });

  it("drops generic bucket names and rejects insider signals on HK names", () => {
    expect(namedParties([{ name: "Insiders", change_30d: "+0.50%" }])).toEqual([]);
    expect(namedParties([{ name: "CITIBANK N.A.", change_30d: "+1.22%" }])).toHaveLength(1);
    expect(
      parseOwnershipRecord({
        ticker: "0700.HK",
        as_of_date: "2026-09-04",
        signal_type: "INSIDER_BULLISH",
        top_buyers: [{ name: "Insiders", change_30d: "+0.50%" }],
      }),
    ).toEqual({ error: expect.stringContaining("insider") });
    const flow = latestNamedFlow([
      {
        ticker: "0700.HK",
        as_of_date: "2026-09-07",
        market_type: "HK",
        institutional_pct: 52,
        retail_pct: 9,
        inst_holding_pct: null,
        insider_holding_pct: null,
        short_interest_pct: null,
        net_insider_usd: null,
        top_buyers: [{ name: "Insiders", change_30d: "+0.50%" }],
        top_sellers: [{ name: "Retail Brokers", change_30d: "-0.74%" }],
        signal_type: "NEUTRAL",
      },
      {
        ticker: "0700.HK",
        as_of_date: "2026-09-04",
        market_type: "HK",
        institutional_pct: 71,
        retail_pct: 1.8,
        inst_holding_pct: null,
        insider_holding_pct: null,
        short_interest_pct: null,
        net_insider_usd: null,
        top_buyers: [{ name: "CITIBANK N.A.", change_30d: "+1.22%" }],
        top_sellers: [{ name: "THE HONGKONG AND SHANGHAI BANKING", change_30d: "-0.70%" }],
        signal_type: "NEUTRAL",
      },
    ]);
    expect(flow.buyers[0]?.name).toBe("CITIBANK N.A.");
  });

  it("rejects estimated percentages with a reason agents can read", () => {
    expect(
      parseOwnershipRecord({
        ticker: "0700.HK",
        as_of_date: "2026-09-07",
        signal_type: "NEUTRAL",
        institutional_pct: 52.74,
        retail_pct: 9.12,
      }),
    ).toEqual({ error: expect.stringContaining("no real CCASS participant names") });
    expect(
      parseOwnershipRecord({
        ticker: "AAPL",
        as_of_date: "2026-09-07",
        signal_type: "INSIDER_BULLISH",
        institutional_pct: 50.64,
        retail_pct: 10.27,
      }),
    ).toEqual({ error: expect.stringContaining("13F/Form 4") });
  });
});
