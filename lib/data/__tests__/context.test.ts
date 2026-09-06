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
  });
});
