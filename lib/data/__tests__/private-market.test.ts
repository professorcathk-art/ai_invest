import { describe, expect, it } from "vitest";
import {
  canonicalizeTarget,
  cleanCompanyName,
  formatDealSize,
  isUsableCompanyName,
  mergeDealRows,
  parsePrivateDeals,
} from "../private-market";
import { sourceLabel } from "../deal-sources";

describe("private deal digest helpers", () => {
  it("canonicalizes Cognition variants onto one key", () => {
    expect(canonicalizeTarget("AI coding startup Cognition")).toBe("cognition");
    expect(canonicalizeTarget("Cognition AI")).toBe("cognition");
    expect(canonicalizeTarget("AI Startup Cognition")).toBe("cognition");
  });

  it("normalizes deal size text", () => {
    expect(formatDealSize(2_000_000_000)).toBe("$2B");
    expect(formatDealSize("$2 billion")).toBe("$2B");
    expect(formatDealSize("$2 Billion")).toBe("$2B");
    expect(formatDealSize("$50M")).toBe("$50M");
  });

  it("groups the same deal and keeps multiple short source labels", () => {
    const rows = mergeDealRows([
      {
        id: "1",
        announcedOn: "2026-09-08",
        target: "AI coding startup Cognition",
        acquirer: "",
        sector: "",
        dealType: "Funding",
        dealSize: "$2 billion",
        leadInvestors: "",
        sources: [{ label: "TechCrunch", url: "https://techcrunch.com/cognition-1" }],
      },
      {
        id: "2",
        announcedOn: "2026-09-08",
        target: "Cognition AI",
        acquirer: "",
        sector: "Artificial Intelligence",
        dealType: "Funding",
        dealSize: "$2B",
        leadInvestors: "",
        sources: [{ label: "Yahoo", url: "https://finance.yahoo.com/cognition" }],
      },
      {
        id: "3",
        announcedOn: "2026-09-08",
        target: "AI Startup Cognition",
        acquirer: "",
        sector: "",
        dealType: "Funding",
        dealSize: "$2 Billion",
        leadInvestors: "",
        sources: [{ label: "CNBC", url: "https://www.cnbc.com/cognition" }],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.target).toBe("Cognition");
    expect(rows[0]?.sources.map((item) => item.label).sort()).toEqual(["CNBC", "TechCrunch", "Yahoo"]);
    expect(rows[0]?.sector).toBe("Artificial Intelligence");
  });

  it("groups the same target on the same day even when one row has no size", () => {
    const rows = mergeDealRows([
      {
        id: "1",
        announcedOn: "2026-09-08",
        target: "Cognition",
        acquirer: "",
        sector: "",
        dealType: "Funding",
        dealSize: "",
        leadInvestors: "",
        sources: [{ label: "Yahoo", url: "https://finance.yahoo.com/cognition-b" }],
      },
      {
        id: "2",
        announcedOn: "2026-09-08T18:00:00Z",
        target: "Cognition AI",
        acquirer: "",
        sector: "Artificial Intelligence",
        dealType: "Funding",
        dealSize: "$2 billion",
        leadInvestors: "",
        sources: [{ label: "CNBC", url: "https://www.cnbc.com/cognition-b" }],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dealSize).toBe("$2B");
    expect(rows[0]?.sources).toHaveLength(2);
  });

  it("groups the same funding announced a day apart", () => {
    const rows = mergeDealRows([
      {
        id: "1",
        announcedOn: "2026-09-03",
        target: "Crusoe",
        acquirer: "",
        sector: "",
        dealType: "Funding",
        dealSize: "$3B",
        leadInvestors: "",
        sources: [{ label: "TechCrunch", url: "https://techcrunch.com/crusoe-a" }],
      },
      {
        id: "2",
        announcedOn: "2026-09-04",
        target: "Crusoe",
        acquirer: "",
        sector: "Data Centers",
        dealType: "Funding",
        dealSize: "$3B",
        leadInvestors: "",
        sources: [{ label: "TechCrunch", url: "https://techcrunch.com/crusoe-b" }],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sector).toBe("Data Centers");
  });

  it("maps source hosts to short labels", () => {
    expect(sourceLabel("https://www.bloomberg.com/news/x", "Google News")).toBe("Bloomberg");
    expect(sourceLabel("https://www.cnbc.com/x")).toBe("CNBC");
    expect(sourceLabel("https://finance.yahoo.com/news/x")).toBe("Yahoo");
    expect(
      sourceLabel(
        "https://news.google.com/rss/articles/abc",
        "Google News",
        "EverBank to combine with WaFd in $3.9 billion reverse merger - CNBC",
      ),
    ).toBe("CNBC");
  });

  it("cleans headline fragments into a company name", () => {
    expect(cleanCompanyName("Exclusive: AI data labeling startup Sapien")).toBe("Sapien");
    expect(cleanCompanyName("Fashion startup Atorie")).toBe("Atorie");
    expect(cleanCompanyName("Crusoe reportedly")).toBe("Crusoe");
    expect(isUsableCompanyName("Exclusive")).toBe(false);
    expect(isUsableCompanyName("French A.I. Start")).toBe(false);
    expect(isUsableCompanyName("Mistral")).toBe(true);
  });

  it("collapses a reverse merger listed twice with swapped names", () => {
    const rows = mergeDealRows([
      {
        id: "1",
        announcedOn: "2026-09-08",
        target: "WaFd",
        acquirer: "EverBank Financial",
        sector: "Banking",
        dealType: "Merger",
        dealSize: "$3.9B",
        leadInvestors: "",
        sources: [{ label: "CNBC", url: "https://www.cnbc.com/wafd" }],
      },
      {
        id: "2",
        announcedOn: "2026-09-08",
        target: "EverBank Financial",
        acquirer: "WaFd",
        sector: "Banking",
        dealType: "Merger",
        dealSize: "$3.9 billion",
        leadInvestors: "",
        sources: [{ label: "Yahoo", url: "https://finance.yahoo.com/wafd" }],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sources).toHaveLength(2);
    expect([rows[0]?.target, rows[0]?.acquirer].sort()).toEqual(["EverBank Financial", "WaFd"]);
  });

  it("keeps FMP target/buyer fields", () => {
    const rows = parsePrivateDeals([
      { targetedCompanyName: "Acme", companyName: "Buyer", transactionValue: 2e9, url: "https://www.reuters.com/a" },
    ]);
    expect(rows[0]).toMatchObject({ target: "Acme", acquirer: "Buyer", dealSize: "$2B" });
    expect(rows[0]?.sources[0]?.label).toBe("Reuters");
  });
});
