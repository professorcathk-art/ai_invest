import { describe, expect, it } from "vitest";
import {
  catalystsFromNews,
  fallbackCatalysts,
  fallbackDividendMetrics,
  finalizeCatalystPack,
  ratioToPct,
} from "../catalysts";
import { fallbackSmartMoneyInsight } from "@/lib/llm/insights";
import { messages } from "@/lib/i18n/messages";
import { ownershipLlmBrief } from "../ownership";

describe("dividend and catalyst fallbacks", () => {
  it("keeps i18n keys aligned", () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.zh).sort());
    expect(messages.zh.tabCatalysts).toBe("股息與催化劑");
    expect(messages.en.tabCatalysts).toBe("Dividends & Catalysts");
  });

  it("normalizes Yahoo decimal yields to percent", () => {
    expect(ratioToPct(0.052)).toBeCloseTo(5.2, 8);
    expect(ratioToPct({ raw: 0.45 })).toBeCloseTo(45, 8);
    expect(ratioToPct(0.45, true)).toBeCloseTo(0.45, 8);
  });

  it("uses ticker-specific dividend fallbacks so the tab is never blank", () => {
    expect(fallbackDividendMetrics("0005.HK").yieldPct).toBeGreaterThan(4);
    expect(fallbackDividendMetrics("NVDA").annualDps).toBeLessThan(1);
    expect(fallbackDividendMetrics("0700.HK").currency).toBe("HKD");
    const pack = finalizeCatalystPack({
      ticker: "9988.HK",
      name: "Alibaba",
      currency: "USD",
      source: "fallback",
      synthesized: false,
      dividend: fallbackDividendMetrics("9988.HK"),
      history: [],
      catalysts: [],
      locale: "zh",
    });
    expect(pack.currency).toBe("HKD");
    expect(pack.catalysts.length).toBeGreaterThanOrEqual(3);
    expect(pack.catalysts.every((row) => row.title.includes("Alibaba") || row.title.includes("港交所"))).toBe(true);
  });

  it("maps search headlines into structured events", () => {
    const rows = catalystsFromNews(
      [
        { title: "HSBC reports interim results", publisher: "Yahoo", url: "https://example.com", publishedAt: "2026-09-01T00:00:00Z" },
        { title: "Board authorizes $3bn buyback", publisher: "Yahoo", url: "https://example.com", publishedAt: "2026-08-20T00:00:00Z" },
      ],
      "en",
    );
    expect(rows[0]?.type).toBe("earnings");
    expect(rows[1]?.type).toBe("buyback");
    expect(rows[1]?.impact).toBe("bullish");
  });

  it("does not invent CCASS figures when snapshots are missing", () => {
    const insight = fallbackSmartMoneyInsight([], "en");
    expect(insight.bullets).toHaveLength(3);
    expect(insight.bullets.join(" ")).toMatch(/No ingested CCASS/i);
    expect(ownershipLlmBrief([])).toMatch(/No ingested/);
    expect(fallbackCatalysts("AAPL", "Apple", "en")[0]?.type).toBe("earnings");
  });
});
