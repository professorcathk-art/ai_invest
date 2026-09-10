import { describe, expect, it } from "vitest";
import { filingExcerptBrief, filingLabel, isFilingDocType, type CompanyFiling } from "../filings";

const row = (over: Partial<CompanyFiling> = {}): CompanyFiling => ({
  ticker: "0700.HK",
  fiscalYear: 2025,
  docType: "annual_report",
  title: "2025 Annual Report",
  sourceUrl: "https://www1.hkexnews.hk/listedco/listconews/sehk/2025/x.pdf",
  storagePath: "0700.HK/2025-annual_report.pdf",
  publicUrl: "https://example.supabase.co/storage/v1/object/public/company-filings/0700.HK/2025-annual_report.pdf",
  excerpt: "We operate Weixin and QQ. Cloud and FinTech are disclosed segments.",
  bytes: 1200,
  fetchedAt: "2026-09-10T00:00:00Z",
  ...over,
});

describe("company filings helpers", () => {
  it("accepts only known doc types", () => {
    expect(isFilingDocType("annual_report")).toBe(true);
    expect(isFilingDocType("10-k")).toBe(true);
    expect(isFilingDocType("20-f")).toBe(true);
    expect(isFilingDocType("interim")).toBe(true);
    expect(isFilingDocType("8-k")).toBe(false);
  });

  it("labels stored annuals in both locales", () => {
    expect(filingLabel(row(), "en")).toBe("2025 annual report");
    expect(filingLabel(row(), "zh")).toBe("2025 年報");
    expect(filingLabel(row({ docType: "10-k" }), "en")).toBe("2025 annual report (10-K)");
    expect(filingLabel(row({ docType: "interim" }), "zh")).toBe("2025 中期報告");
  });

  it("feeds the newest excerpt to the industry expert and stays empty when none exist", () => {
    const older = row({ fiscalYear: 2024, excerpt: "older" });
    expect(filingExcerptBrief([row(), older])).toContain("Weixin");
    expect(filingExcerptBrief([row({ excerpt: "   " })])).toBe("");
  });
});
