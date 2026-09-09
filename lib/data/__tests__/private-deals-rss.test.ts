import { describe, expect, it } from "vitest";
import { dealFromHeadline } from "../private-deals-rss";

describe("dealFromHeadline", () => {
  it("parses an acquisition headline", () => {
    const deal = dealFromHeadline({
      title: "Acme to acquire WidgetCo for $1.2 billion",
      publisher: "Reuters",
      url: "https://example.com/a",
      publishedAt: "2026-09-07T00:00:00.000Z",
    });
    expect(deal).toMatchObject({
      acquirer: "Acme",
      target: "WidgetCo",
      dealType: "M&A",
      dealSize: "$1.2B",
    });
    expect(deal?.sources[0]?.label).toBe("Reuters");
  });

  it("parses a funding headline and ignores non-deal news", () => {
    expect(
      dealFromHeadline({
        title: "Nimbus raises $80 million Series B",
        publisher: "TechCrunch",
        url: "https://example.com/b",
        publishedAt: "2026-09-06T00:00:00.000Z",
      }),
    ).toMatchObject({
      target: "Nimbus",
      dealType: "Venture round",
    });
    expect(
      dealFromHeadline({
        title: "Markets close mixed as yields ease",
        publisher: "CNBC",
        url: "https://example.com/c",
        publishedAt: null,
      }),
    ).toBeNull();
    expect(
      dealFromHeadline({
        title: "Labor Day parade raises money for tornado relief",
        publisher: "Google News",
        url: "https://example.com/d",
        publishedAt: null,
      }),
    ).toBeNull();
  });
});
