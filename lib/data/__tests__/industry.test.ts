import { describe, expect, it } from "vitest";
import {
  classifyHeadline,
  headlineFitsLocale,
  inDateWindow,
  isMacroNews,
  isSectorRelevant,
  keepSectorTape,
  mentionedTickers,
  parseNameCalls,
  publishedDateHkt,
  resolveWatchlistTicker,
  toSectorHeadline,
} from "../industry";
import { groupNameCallsByMarket, hktCalendarDate, shiftIsoDate, weekEndSunday, weekStartMonday } from "../industry-sectors";

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

  it("keeps a Hong Kong week window and splits EN/ZH titles", () => {
    expect(weekStartMonday("2026-09-10")).toBe("2026-09-07");
    expect(weekEndSunday("2026-09-10")).toBe("2026-09-13");
    expect(inDateWindow("2026-09-08T16:30:00Z", "2026-09-10", 4, false)).toBe(true);
    expect(inDateWindow("2026-09-06T02:00:00Z", "2026-09-10", 4, false)).toBe(false);
    expect(headlineFitsLocale("U.S. military destroys five Iranian oil tankers", "en")).toBe(true);
    expect(headlineFitsLocale("美軍擊毀五艘伊朗油輪", "en")).toBe(false);
    expect(headlineFitsLocale("美軍擊毀五艘伊朗油輪", "zh")).toBe(true);
  });

  it("resolves watchlist aliases and groups US vs HK names", () => {
    expect(resolveWatchlistTicker("Nvidia", ["NVDA", "0981.HK"], { NVDA: ["nvidia"], "0981.HK": ["smic"] })).toBe("NVDA");
    expect(resolveWatchlistTicker("981.HK", ["0981.HK"])).toBe("0981.HK");
    expect(parseNameCalls([{ ticker: "SMIC", reason: "Export-control tape" }], ["NVDA", "0981.HK"], { "0981.HK": ["smic"] })).toEqual([
      { ticker: "0981.HK", reason: "Export-control tape" },
    ]);
    expect(groupNameCallsByMarket([
      { ticker: "NVDA", reason: "GPU demand" },
      { ticker: "0981.HK", reason: "Foundry" },
    ])).toEqual([
      { market: "US", rows: [{ ticker: "NVDA", reason: "GPU demand" }] },
      { market: "HK", rows: [{ ticker: "0981.HK", reason: "Foundry" }] },
    ]);
  });
});
