import { describe, expect, it } from "vitest";
import {
  marketFromTicker,
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
      as_of_date: "2026-09-06",
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
        { ticker: "AAPL", as_of_date: "2026-03-31", signal_type: "INSIDER_BULLISH", inst_holding_pct: 67.1 },
      ],
    });
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    const ordered = sortChronological(parsed);
    expect(ordered[0]?.as_of_date).toBe("2026-03-31");
    expect(pctDelta(67.1, 68.5)).toBeCloseTo(1.4, 8);
  });
});
