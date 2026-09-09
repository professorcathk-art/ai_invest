import { describe, expect, it } from "vitest";
import {
  extractPreText,
  hkexCodeToTicker,
  latestShortSellingRow,
  parseHkexShortSellingText,
  parseShortSellingRecord,
  parseShortSellingSources,
  preferDayClose,
} from "../hkex-short-selling";

const LIVE_PRE = `
                          SHORT SELLING TURNOVER
                    (MAIN BOARD) UP TO DAY CLOSE TODAY

TRADING DATE : 08 Sep 2026

(  $000)

CODE   NAME OF STOCK            SHARES        TURNOVER ($000)
-----  -----------------------  -----------   ---------------
   1   CKH HOLDINGS               1,234,000          55,678
   5   HSBC HOLDINGS              2,000,000         120,000
 700   TENCENT HOLDINGS           3,456,789         890,123
9988   BABA-SW                      111,000          12,345
`;

const PLACEHOLDER = `
<html><body><pre><font size='1'>
Short Selling Turnover (Main Board) up to day close today will be available after day close.
</font></pre></body></html>
`;

describe("HKEX short-selling parser", () => {
  it("maps unpadded HKEX codes onto 0700.HK-style tickers", () => {
    expect(hkexCodeToTicker("1")).toBe("0001.HK");
    expect(hkexCodeToTicker("700")).toBe("0700.HK");
    expect(hkexCodeToTicker("9988")).toBe("9988.HK");
  });

  it("skips the overnight placeholder and does not invent a date", () => {
    const parsed = parseHkexShortSellingText(extractPreText(PLACEHOLDER), {
      board: "MAIN",
      session: "DAY_CLOSE",
      source_url: "https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/ASHTMAIN.HTM",
    });
    expect(parsed.placeholder).toBe(true);
    expect(parsed.rows).toEqual([]);
    expect(parsed.as_of_date).toBeNull();
  });

  it("parses day-close shares and converts $000 turnover to HKD", () => {
    const parsed = parseHkexShortSellingText(LIVE_PRE, {
      source_url: "https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/ASHTMAIN.HTM",
    });
    expect(parsed.placeholder).toBe(false);
    expect(parsed.as_of_date).toBe("2026-09-08");
    expect(parsed.session).toBe("DAY_CLOSE");
    expect(parsed.board).toBe("MAIN");
    const tencent = parsed.rows.find((row) => row.ticker === "0700.HK");
    expect(tencent).toMatchObject({
      short_shares: 3456789,
      short_turnover_hkd: 890_123_000,
      stock_name: "TENCENT HOLDINGS",
    });
    expect(parsed.rows.map((row) => row.ticker)).toEqual(["0001.HK", "0005.HK", "0700.HK", "9988.HK"]);
  });

  it("prefers the day-close print when morning and day both exist", () => {
    const morning = parseShortSellingRecord({
      ticker: "0700.HK",
      as_of_date: "2026-09-08",
      board: "MAIN",
      session: "MORNING_CLOSE",
      short_shares: 1000,
      short_turnover_hkd: 50_000,
      source_url: "https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/MSHTMAIN.HTM",
    });
    const day = parseShortSellingRecord({
      ticker: "0700.HK",
      as_of_date: "2026-09-08",
      board: "MAIN",
      session: "DAY_CLOSE",
      short_shares: 2000,
      short_turnover_hkd: 90_000,
      source_url: "https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/ASHTMAIN.HTM",
    });
    expect("error" in morning || "error" in day).toBe(false);
    if ("error" in morning || "error" in day) return;
    expect(latestShortSellingRow(preferDayClose([morning, day]))?.session).toBe("DAY_CLOSE");
    expect(latestShortSellingRow([morning, day])?.short_shares).toBe(2000);
  });

  it("rejects invented US tickers and accepts a sourced record list", () => {
    expect(parseShortSellingRecord({ ticker: "AAPL", as_of_date: "2026-09-08", short_shares: 1, short_turnover_hkd: 1, source_url: "x" })).toEqual({
      error: expect.stringContaining("Hong Kong"),
    });
    const parsed = parseShortSellingSources({
      sources: [
        {
          url: "https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/ASHTMAIN.HTM",
          board: "MAIN",
          session: "DAY_CLOSE",
          text: LIVE_PRE,
        },
        { url: "https://example.com/placeholder", text: extractPreText(PLACEHOLDER) },
      ],
    });
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed).toHaveLength(4);
  });
});
