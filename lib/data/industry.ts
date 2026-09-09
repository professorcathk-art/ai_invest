import type { Locale } from "@/lib/i18n/messages";
import { fetchPublicHeadlines } from "./context";
import { googleNewsUrl, parseRss, uniqueRss, type RssItem } from "./rss";
import {
  emptyResearch,
  hktCalendarDate,
  keepSectorTape,
  mentionedTickers,
  parseNameCalls,
  publishedDateHkt,
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
  hktCalendarDate,
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

function onRequestedDate(item: RssItem, date: string, allowUndated: boolean): boolean {
  const day = publishedDateHkt(item.publishedAt);
  if (!day) return allowUndated;
  return day === date;
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
): Promise<SectorHeadline[]> {
  const spec = sectorSpec(sector);
  const today = hktCalendarDate();
  const allowUndated = date === today;
  const q = SECTOR_QUERIES[spec.id][locale];
  const extraFeed =
    spec.id === "china-internet"
      ? parseRss("https://www.scmp.com/rss/91/feed", "SCMP", 8)
      : parseRss("https://feeds.bbci.co.uk/news/business/rss.xml", "BBC Business", 8);

  const [tickerPacks, google, reuters, cnbc, extra] = await Promise.all([
    Promise.all(
      spec.tickers.slice(0, 4).map(async (ticker) => {
        const news = await fetchPublicHeadlines(ticker, locale);
        return news
          .filter((item) => onRequestedDate(item, date, allowUndated))
          .map((item) => toSectorHeadline(item, sector));
      }),
    ),
    parseRss(googleNewsUrl(q, locale), "Google News", 14),
    parseRss("https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best", "Reuters", 8),
    parseRss("https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", "CNBC", 8),
    extraFeed,
  ]);

  const wire = (await uniqueRss([google, reuters, cnbc, extra], 24))
    .filter((item) => onRequestedDate(item, date, allowUndated))
    .filter((item) => keepSectorTape(item.title, sector))
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
  return headlines.slice(0, 16);
}

export async function loadSectorResearch(
  sector: IndustrySectorId,
  locale: Locale,
  date: string,
): Promise<SectorResearch> {
  const stored = await getIndustryDigest(sector, locale, date);
  if (stored?.brief.length) {
    const today = hktCalendarDate();
    const yesterday = shiftIsoDate(today, -1);
    if (date === today || date === yesterday) {
      const headlines = await collectSectorHeadlines(sector, locale, date);
      if (headlines.length) return { ...stored, headlines, live: date === today };
    }
    return stored;
  }
  const today = hktCalendarDate();
  const yesterday = shiftIsoDate(today, -1);
  if (date !== today && date !== yesterday) {
    return stored ?? emptyResearch(sector, date, locale);
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return writeSectorDigest(sector, locale, date, !stored?.brief.length);
  }
  const headlines = await collectSectorHeadlines(sector, locale, date);
  return {
    ...(stored ?? emptyResearch(sector, date, locale)),
    headlines: headlines.length ? headlines : (stored?.headlines ?? []),
    live: true,
  };
}

export async function writeSectorDigest(
  sector: IndustrySectorId,
  locale: Locale,
  date: string,
  force = false,
): Promise<SectorResearch> {
  if (!force) {
    const stored = await getIndustryDigest(sector, locale, date);
    if (stored?.brief.length) return stored;
  }
  const headlines = await collectSectorHeadlines(sector, locale, date);
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
  };
  const written = await upsertIndustryDigest(payload);
  return written ?? payload;
}

export async function listDigestDates(sector: IndustrySectorId, locale: Locale): Promise<string[]> {
  return listIndustryDigestDates(sector, locale);
}
