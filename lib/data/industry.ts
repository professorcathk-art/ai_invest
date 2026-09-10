import type { Locale } from "@/lib/i18n/messages";
import { fetchPublicHeadlines } from "./context";
import { googleNewsUrl, parseRss, uniqueRss, type RssItem } from "./rss";
import {
  digestWeekStarts,
  emptyResearch,
  fallbackWatchlistCalls,
  hasDeskNote,
  headlineFitsLocale,
  hktCalendarDate,
  inDateWindow,
  inclusiveDays,
  keepSectorTape,
  mentionedTickers,
  parseNameCalls,
  sectorSpec,
  tapeEndForWeek,
  weekEndSunday,
  weekStartMonday,
  type IndustrySectorId,
  type SectorHeadline,
  type SectorNameCall,
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
  digestWeekStarts,
  emptyResearch,
  fallbackWatchlistCalls,
  groupNameCallsByMarket,
  hasDeskNote,
  headlineFitsLocale,
  hktCalendarDate,
  inDateWindow,
  inclusiveDays,
  isIndustrySectorId,
  isMacroNews,
  isSectorRelevant,
  keepSectorTape,
  listingMarket,
  mentionedTickers,
  parseNameCalls,
  publishedDateHkt,
  resolveWatchlistTicker,
  shiftIsoDate,
  tapeEndForWeek,
  weekEndSunday,
  weekStartMonday,
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
  days = 7,
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

function weekWindow(date: string, today = hktCalendarDate()) {
  const weekStart = weekStartMonday(date);
  const weekEnd = weekEndSunday(weekStart);
  const tapeEnd = tapeEndForWeek(weekStart, today);
  const windowDays = inclusiveDays(weekStart, tapeEnd);
  return { weekStart, weekEnd, tapeEnd, windowDays, isCurrentWeek: weekStart === weekStartMonday(today) };
}

function stampResearch(
  row: SectorResearch,
  headlines: SectorHeadline[],
  locale: Locale,
  weekStart: string,
  weekEnd: string,
  live: boolean,
): SectorResearch {
  return {
    ...row,
    date: weekStart,
    locale,
    headlines: headlines.filter((item) => headlineFitsLocale(item.title, locale)),
    fromDate: weekStart,
    windowDays: inclusiveDays(weekStart, weekEnd),
    live,
  };
}

function mergeDesk(
  desk: { brief: string[]; beneficiaries: SectorNameCall[]; atRisk: SectorNameCall[] },
  headlines: SectorHeadline[],
  sector: IndustrySectorId,
  locale: Locale,
): { brief: string[]; beneficiaries: SectorNameCall[]; atRisk: SectorNameCall[] } {
  const spec = sectorSpec(sector);
  const aliases = spec.aliases as Record<string, readonly string[]>;
  let beneficiaries = parseNameCalls(desk.beneficiaries, spec.tickers, aliases);
  let atRisk = parseNameCalls(desk.atRisk, spec.tickers, aliases);
  let brief = desk.brief.map((item) => item.trim()).filter(Boolean).slice(0, 4);
  if (!beneficiaries.length && !atRisk.length) {
    const fallback = fallbackWatchlistCalls(headlines, sector, locale);
    beneficiaries = fallback.beneficiaries;
    atRisk = fallback.atRisk;
  }
  if (!brief.length && headlines.length) {
    brief =
      locale === "zh"
        ? ["本週公開要聞已按觀察名單推斷受惠與受壓股份，並非單一股份的投委會投票。"]
        : ["Weekly tape mapped onto the watchlist. This is not an IC vote on a single name."];
  }
  return { brief, beneficiaries, atRisk };
}

export async function loadSectorResearch(
  sector: IndustrySectorId,
  locale: Locale,
  date: string,
): Promise<SectorResearch> {
  const { weekStart, weekEnd, tapeEnd, windowDays, isCurrentWeek } = weekWindow(date);
  const stored = await getIndustryDigest(sector, locale, weekStart);
  if (stored && hasDeskNote(stored)) {
    if (isCurrentWeek) {
      const headlines = await collectSectorHeadlines(sector, locale, tapeEnd, windowDays);
      if (headlines.length) return stampResearch(stored, headlines, locale, weekStart, weekEnd, true);
    }
    return stampResearch(stored, stored.headlines, locale, weekStart, weekEnd, false);
  }
  if (!isCurrentWeek) {
    return stampResearch(
      stored ?? emptyResearch(sector, weekStart, locale),
      stored?.headlines ?? [],
      locale,
      weekStart,
      weekEnd,
      false,
    );
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return writeSectorDigest(sector, locale, weekStart, !stored || !hasDeskNote(stored));
  }
  const headlines = await collectSectorHeadlines(sector, locale, tapeEnd, windowDays);
  return stampResearch(
    stored ?? emptyResearch(sector, weekStart, locale),
    headlines.length ? headlines : (stored?.headlines ?? []),
    locale,
    weekStart,
    weekEnd,
    true,
  );
}

export async function writeSectorDigest(
  sector: IndustrySectorId,
  locale: Locale,
  date: string,
  force = false,
): Promise<SectorResearch> {
  const { weekStart, weekEnd, tapeEnd, windowDays } = weekWindow(date);
  if (!force) {
    const stored = await getIndustryDigest(sector, locale, weekStart);
    if (stored && hasDeskNote(stored)) {
      const headlines = await collectSectorHeadlines(sector, locale, tapeEnd, windowDays);
      return stampResearch(stored, headlines.length ? headlines : stored.headlines, locale, weekStart, weekEnd, false);
    }
  }
  const headlines = await collectSectorHeadlines(sector, locale, tapeEnd, windowDays);
  const desk = await generateSectorDeskNote({
    sector,
    locale,
    date: weekStart,
    weekEnd,
    headlines,
    watchlist: [...sectorSpec(sector).tickers],
  });
  const merged = mergeDesk(desk, headlines, sector, locale);
  const payload: SectorResearch = {
    sector,
    date: weekStart,
    locale,
    headlines,
    beneficiaries: merged.beneficiaries,
    atRisk: merged.atRisk,
    brief: merged.brief,
    persisted: false,
    live: false,
    fromDate: weekStart,
    windowDays: 7,
  };
  if (!headlines.length || !hasDeskNote(payload)) {
    return payload;
  }
  const written = await upsertIndustryDigest(payload);
  return written ?? { ...payload, persisted: true };
}

export async function listDigestDates(sector: IndustrySectorId, locale: Locale): Promise<string[]> {
  return digestWeekStarts(await listIndustryDigestDates(sector, locale));
}
