import type { Locale } from "@/lib/i18n/messages";
import { fetchPublicHeadlines } from "./context";
import { googleNewsUrl, parseRss, uniqueRss, type RssItem } from "./rss";
import {
  emptyResearch,
  hktCalendarDate,
  isSectorRelevant,
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
    en: 'semiconductor OR "artificial intelligence" chip NVIDIA TSMC foundry',
    zh: "半導體 OR 人工智能 OR 晶片 OR 英偉達 OR 台積電",
  },
  "china-internet": {
    en: "Tencent OR Alibaba OR Meituan OR Xiaomi China internet",
    zh: "騰訊 OR 阿里巴巴 OR 美團 OR 小米 OR 中國互聯網",
  },
  ev: {
    en: '"electric vehicle" OR Tesla OR BYD OR 電動車',
    zh: "電動車 OR 比亞迪 OR 特斯拉",
  },
  biotech: {
    en: "biotech OR pharmaceutical OR FDA OR Eli Lilly OR Innovent",
    zh: "生物科技 OR 藥廠 OR 禮來 OR 信達",
  },
  consumer: {
    en: "Costco OR Nike OR ANTA OR Pop Mart luxury retail",
    zh: "好市多 OR 耐克 OR 安踏 OR 泡泡瑪特 OR 奢侈品零售",
  },
};

export {
  INDUSTRY_SECTORS,
  classifyHeadline,
  emptyResearch,
  hktCalendarDate,
  isIndustrySectorId,
  isSectorRelevant,
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
      : Promise.resolve([]);

  const [tickerPacks, google, extra] = await Promise.all([
    Promise.all(
      spec.tickers.slice(0, 4).map(async (ticker) => {
        const news = await fetchPublicHeadlines(ticker, locale);
        return news
          .filter((item) => onRequestedDate(item, date, allowUndated))
          .filter((item) => mentionedTickers(item.title, sector).includes(ticker))
          .map((item) => toSectorHeadline(item, sector));
      }),
    ),
    parseRss(googleNewsUrl(q, locale), "Google News", 12),
    extraFeed,
  ]);

  const wire = (await uniqueRss([google, extra], 20))
    .filter((item) => onRequestedDate(item, date, allowUndated))
    .filter((item) => isSectorRelevant(item.title, sector))
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
  return headlines.slice(0, 14);
}

export async function loadSectorResearch(
  sector: IndustrySectorId,
  locale: Locale,
  date: string,
): Promise<SectorResearch> {
  const stored = await getIndustryDigest(sector, locale, date);
  if (stored) return stored;
  const today = hktCalendarDate();
  const yesterday = shiftIsoDate(today, -1);
  if (date !== today && date !== yesterday) {
    return emptyResearch(sector, date, locale);
  }
  const headlines = await collectSectorHeadlines(sector, locale, date);
  return {
    ...emptyResearch(sector, date, locale),
    headlines,
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
