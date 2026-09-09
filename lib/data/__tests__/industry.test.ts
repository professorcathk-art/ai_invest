import { describe, expect, it } from "vitest";
import {
  classifyHeadline,
  isMacroNews,
  isSectorRelevant,
  keepSectorTape,
  mentionedTickers,
  parseNameCalls,
  publishedDateHkt,
  toSectorHeadline,
} from "../industry";
import { hktCalendarDate, shiftIsoDate } from "../industry-sectors";

describe("sector digest tape", () => {
  it("only hangs a ticker on a headline when the name is actually there", () => {
    expect(mentionedTickers("Nvidia wins a large GPU order from Microsoft", "ai")).toEqual(["NVDA", "MSFT"]);
    expect(mentionedTickers("Costco raises membership fee", "consumer")).toEqual(["COST"]);
    expect(mentionedTickers("U.S. military destroys five Iranian oil tankers", "ai")).toEqual([]);
    expect(mentionedTickers("Stock futures are little changed overnight", "consumer")).toEqual([]);
  });

  it("keeps unnamed breaking news for the committee to map onto names", () => {
    expect(mentionedTickers("U.S. military destroys five Iranian oil tankers", "ai")).toEqual([]);
    expect(isMacroNews("U.S. military destroys five Iranian oil tankers")).toBe(true);
    expect(keepSectorTape("U.S. military destroys five Iranian oil tankers", "ai")).toBe(true);
    expect(keepSectorTape("Brent crude jumps after weekend attacks", "consumer")).toBe(true);
    expect(isSectorRelevant("TSMC raises advanced-node foundry prices", "ai")).toBe(true);
    expect(isSectorRelevant("Tencent cloud signs a new enterprise deal", "china-internet")).toBe(true);
  });

  it("does not stamp the first watchlist name onto a sector wire", () => {
    const row = toSectorHeadline(
      {
        title: "Brent crude jumps after weekend attacks",
        publisher: "BBC Business",
        url: "https://example.com",
        publishedAt: "2026-09-08T12:00:00Z",
      },
      "consumer",
    );
    expect(row.tickers).toEqual([]);
  });

  it("keeps keyword tone off the ticker list", () => {
    const hit = classifyHeadline("Trump tariff probe hits EV exporters", "en");
    expect(hit.impact).toBe("at_risk");
    expect(parseNameCalls([{ ticker: "COST", reason: "Membership fee hike in the tape" }], ["COST"])).toEqual([
      { ticker: "COST", reason: "Membership fee hike in the tape" },
    ]);
    expect(parseNameCalls([{ ticker: "NVDA", reason: "not on this list" }], ["COST"])).toEqual([]);
  });

  it("maps RSS timestamps onto the Hong Kong calendar day", () => {
    expect(publishedDateHkt("2026-09-08T16:30:00Z")).toBe("2026-09-09");
    expect(shiftIsoDate(hktCalendarDate(new Date("2026-09-09T02:00:00+08:00")), -1)).toBe("2026-09-08");
  });
});
