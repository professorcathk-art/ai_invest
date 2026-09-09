import type { Locale } from "@/lib/i18n/messages";
import { fetchPublicHeadlines } from "./context";
import { googleNewsUrl, parseRss, uniqueRss, type RssItem } from "./rss";
import {
  emptyResearch,
  headlineFitsLocale,
  hktCalendarDate,
  inDateWindow,
  keepSectorTape,
  mentionedTickers,
  parseNameCalls,
  sectorSpec,
  shiftIsoDate,
  type IndustrySectorId,
  type SectorHeadline,
  type SectorResearch,
} from "./industry-sectors";
import { getIndustryDigest, listIndustryDigestDates, upsertIndustryDigest } from "./industry-store";
import { generateSectorDeskNote } from "@/lib/llm/industry-digest";

const SECTOR_QUERIES: Record<IndustrySectorId, { en: string; zh: string }> = {
  ai: {
    en: 'semiconductor OR chip OR GPU OR "artificial intelligence" OR "export control" OR foundry',
    zh: "半導體 OR 晶片 OR 人工智能 OR 出口管制 OR 台積電",
  },
  "china-internet": {
    en: '"China internet" OR Tencent OR Alibaba OR Meituan OR "China tech"',
    zh: "中國互聯網 OR 騰訊 OR 阿里 OR 美團 OR 中概",
  },
  ev: {
    en: '"electric vehicle" OR EV OR battery OR Tesla OR BYD OR tariff',
    zh: "電動車 OR 電池 OR 比亞迪 OR 特斯拉 OR 關稅",
  },
  biotech: {
    en: "biotech OR pharmaceutical OR FDA OR GLP-1 OR drug",
    zh: "生物科技 OR 藥廠 OR 醫藥 OR 新藥",
  },
  consumer: {
    en: "consumer OR retail OR luxury OR tariff OR Costco OR Nike",
    zh: "消費 OR 零售 OR 奢侈品 OR 關稅 OR 耐克",
  },
};

export {
  INDUSTRY_SECTORS,
  classifyHeadline,
  emptyResearch,
  headlineFitsLocale,
  hktCalendarDate,
  inDateWindow,
  isIndustrySectorId,
  isMacroNews,
  isSectorRelevant,
  keepSectorTape,
  mentionedTickers,
  parseNameCalls,
  publishedDateHkt,
  shiftIsoDate,
  type IndustrySectorId,
  type HeadlineImpact,
  type SectorHeadline,
  type SectorNameCall,
  type SectorResearch,
} from "./industry-sectors";

function inWindow(item: RssItem, date: string, days: number, allowUndated: boolean): boolean {
  return inDateWindow(item.publishedAt, date, days, allowUndated);
}

export function toSectorHeadline(item: RssItem, sector: IndustrySectorId, extraTickers: string[] = []): SectorHeadline {
  const mentioned = mentionedTickers(item.title, sector);
  const tickers = [...new Set([...extraTickers, ...mentioned])];
  return {
    title: item.title,
    publisher: item.publisher,
    url: item.url,
    publishedAt: item.publishedAt,
    tickers,
  };
}

export async function collectSectorHeadlines(
  sector: IndustrySectorId,
  locale: Locale,
  date: string,
  days = 3,
): Promise<SectorHeadline[]> {
  const spec = sectorSpec(sector);
  const today = hktCalendarDate();
  const allowUndated = date === today;
  const q = SECTOR_QUERIES[spec.id][locale];
  const extraFeed =
    locale === "zh" && spec.id === "china-internet"
      ? parseRss("https://www.scmp.com/rss/91/feed", "SCMP", 10)
      : parseRss("https://feeds.bbci.co.uk/news/business/rss.xml", "BBC Business", 10);

  const [tickerPacks, google, reuters, cnbc, extra] = await Promise.all([
    Promise.all(
      spec.tickers.slice(0, 4).map(async (ticker) => {
        const news = await fetchPublicHeadlines(ticker, locale);
        return news
          .filter((item) => inWindow(item, date, days, allowUndated))
          .filter((item) => headlineFitsLocale(item.title, locale))
          .map((item) => toSectorHeadline(item, sector));
      }),
    ),
    parseRss(googleNewsUrl(q, locale), "Google News", 18),
    parseRss("https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best", "Reuters", 10),
    parseRss("https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", "CNBC", 10),
    extraFeed,
  ]);

  const wire = (await uniqueRss([google, reuters, cnbc, extra], 48))
    .filter((item) => inWindow(item, date, days, allowUndated))
    .filter((item) => keepSectorTape(item.title, sector))
    .filter((item) => headlineFitsLocale(item.title, locale))
    .map((item) => toSectorHeadline(item, sector));

  const seen = new Set<string>();
  const headlines: SectorHeadline[] = [];
  for (const item of [...tickerPacks.flat(), ...wire]) {
    const key = item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    headlines.push(item);
  }
  headlines.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  return headlines.slice(0, 36);
}

export async function loadSectorResearch(
  sector: IndustrySectorId,
  locale: Locale,
  date: string,
  days = 3,
): Promise<SectorResearch> {
  const windowDays = Math.min(7, Math.max(1, days));
  const fromDate = shiftIsoDate(date, -(windowDays - 1));
  const stamp = (row: SectorResearch, headlines: SectorHeadline[], live: boolean): SectorResearch => ({
    ...row,
    headlines: headlines.filter((item) => headlineFitsLocale(item.title, locale)),
    fromDate,
    windowDays,
    live,
    locale,
  });
  const stored = await getIndustryDigest(sector, locale, date);
  const today = hktCalendarDate();
  const liveEnd = date >= shiftIsoDate(today, -2) && date <= today;
  if (stored?.brief.length) {
    if (liveEnd) {
      const headlines = await collectSectorHeadlines(sector, locale, date, windowDays);
      if (headlines.length) return stamp(stored, headlines, date === today);
    }
    return stamp(stored, stored.headlines, false);
  }
  if (!liveEnd) {
    return stamp(stored ?? emptyResearch(sector, date, locale), stored?.headlines ?? [], false);
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return writeSectorDigest(sector, locale, date, !stored?.brief.length, windowDays);
  }
  const headlines = await collectSectorHeadlines(sector, locale, date, windowDays);
  return stamp(stored ?? emptyResearch(sector, date, locale), headlines.length ? headlines : (stored?.headlines ?? []), true);
}

export async function writeSectorDigest(
  sector: IndustrySectorId,
  locale: Locale,
  date: string,
  force = false,
  days = 3,
): Promise<SectorResearch> {
  if (!force) {
    const stored = await getIndustryDigest(sector, locale, date);
    if (stored?.brief.length) {
      const headlines = await collectSectorHeadlines(sector, locale, date, days);
      return {
        ...stored,
        headlines: headlines.length ? headlines : stored.headlines,
        fromDate: shiftIsoDate(date, -(days - 1)),
        windowDays: days,
      };
    }
  }
  const headlines = await collectSectorHeadlines(sector, locale, date, days);
  const desk = await generateSectorDeskNote({
    sector,
    locale,
    date,
    headlines,
    watchlist: [...sectorSpec(sector).tickers],
  });
  const payload: SectorResearch = {
    sector,
    date,
    locale,
    headlines,
    beneficiaries: parseNameCalls(desk.beneficiaries, sectorSpec(sector).tickers),
    atRisk: parseNameCalls(desk.atRisk, sectorSpec(sector).tickers),
    brief: desk.brief,
    persisted: true,
    live: false,
    fromDate: shiftIsoDate(date, -(days - 1)),
    windowDays: days,
  };
  const written = await upsertIndustryDigest(payload);
  return written ?? payload;
}

export async function listDigestDates(sector: IndustrySectorId, locale: Locale): Promise<string[]> {
  return listIndustryDigestDates(sector, locale);
}
