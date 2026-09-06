import { describe, expect, it } from "vitest";
import { isTickerRelatedHeadline } from "../context";
import { reportingCurrency } from "../normalize";
import { formatMoney } from "@/lib/format";

describe("headline relevance", () => {
  it("keeps Bank of China headlines and drops unrelated market color", () => {
    expect(isTickerRelatedHeadline("Bank of China posts stable net interest margin", "3988.HK", "Bank of China Limited")).toBe(
      true,
    );
    expect(isTickerRelatedHeadline("3988.HK rises after results", "3988.HK", "Bank of China Limited")).toBe(true);
    expect(isTickerRelatedHeadline("Oil jumps as OPEC+ signals cuts", "3988.HK", "Bank of China Limited")).toBe(false);
  });
});

describe("reporting currency", () => {
  it("keeps HK listings in HKD even if the feed says USD", () => {
    expect(reportingCurrency("9988.HK", "USD")).toBe("HKD");
    expect(reportingCurrency("9988.HK", "HKD")).toBe("HKD");
    expect(formatMoney(154.5, "HKD")).toBe("HKD 154.50");
    expect(formatMoney(-101.99, "HKD")).toBe("-HKD 101.99");
  });
});

describe("usable valuation", () => {
  it("keeps a cash-burning name on the workbench when Gordon DCF is negative", async () => {
    const { isUsableValuation } = await import("../normalize");
    const years = [2022, 2023, 2024].map((year) => ({
      year,
      fiscalDate: `${year}-12-31`,
      revenue: 50_000,
      grossProfit: 8_000,
      ebit: -10_000,
      ebitda: -6_000,
      da: 4_000,
      capex: 8_000,
      nwc: 2_000,
      deltaNwc: 200,
      taxRate: 0.165,
      fcf: -12_000,
      interestExpense: 1_000,
      netIncome: -12_000,
      totalDebt: 30_000,
      cash: 10_000,
      equity: 20_000,
      shares: 2_000,
      roic: null,
    }));
    expect(
      isUsableValuation(
        {
          quote: {
            ticker: "9866.HK",
            name: "NIO",
            exchange: "HKSE",
            price: 29.5,
            marketCap: 1,
            enterpriseValue: 1,
            pe: null,
            evEbitda: null,
            evRevenue: null,
            beta: 1,
            sharesOutstanding: 1,
            currency: "HKD",
            sector: "",
          },
          years,
          source: "yahoo",
          warnings: [],
          defaults: { riskFreeRate: 0.035, equityRiskPremium: 0.055, costOfDebt: 0.065, taxRate: 0.165 },
        },
        { impliedPriceGordon: -101.99, marketPrice: 29.5, enterpriseValueGordon: -2e11 },
      ),
    ).toBe(true);
  });
});
