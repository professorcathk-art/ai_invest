import type { Locale } from "@/lib/i18n/messages";
import { fetchPublicHeadlines } from "./context";
import { googleNewsUrl, parseRss, uniqueRss } from "./rss";
import {
  INDUSTRY_SECTORS,
  classifyHeadline,
  type IndustrySectorId,
  type SectorHeadline,
  type SectorResearch,
} from "./industry-sectors";

const SECTOR_QUERIES: Record<IndustrySectorId, { en: string; zh: string }> = {
  ai: {
    en: 'semiconductor OR "artificial intelligence" chip NVIDIA TSMC foundry',
    zh: "半導體 OR 人工智能 OR 晶片 OR 英偉達",
  },
  "china-internet": {
    en: "Tencent OR Alibaba OR Meituan OR PDD China internet",
    zh: "騰訊 OR 阿里巴巴 OR 美團 OR 中國互聯網",
  },
  ev: {
    en: '"electric vehicle" OR Tesla OR BYD OR battery OR 電動車',
    zh: "電動車 OR 比亞迪 OR 特斯拉 OR 電池",
  },
  biotech: {
    en: "biotech OR pharmaceutical OR FDA OR 生物科技",
    zh: "生物科技 OR 藥廠 OR 醫藥",
  },
  consumer: {
    en: "consumer staple OR luxury retail OR Nike OR 消費",
    zh: "消費 OR 零售 OR 奢侈品",
  },
};

export {
  INDUSTRY_SECTORS,
  classifyHeadline,
  isIndustrySectorId,
  type IndustrySectorId,
  type HeadlineImpact,
  type SectorHeadline,
  type SectorResearch,
} from "./industry-sectors";

export async function loadSectorResearch(
  sector: IndustrySectorId,
  locale: Locale,
): Promise<SectorResearch> {
  const spec = INDUSTRY_SECTORS.find((s) => s.id === sector) ?? INDUSTRY_SECTORS[0];
  const q = SECTOR_QUERIES[spec.id][locale];
  const [tickerPacks, google, reuters, cnbc, extra] = await Promise.all([
    Promise.all(
      spec.tickers.slice(0, 3).map(async (ticker) => {
        const news = await fetchPublicHeadlines(ticker, locale);
        return news.map((item) => ({ item, ticker }));
      }),
    ),
    parseRss(googleNewsUrl(q, locale), "Google News", 10),
    parseRss("https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best", "Reuters", 8),
    parseRss("https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", "CNBC", 8),
    spec.id === "china-internet"
      ? parseRss("https://www.scmp.com/rss/91/feed", "SCMP", 8)
      : parseRss("https://feeds.bbci.co.uk/news/business/rss.xml", "BBC Business", 8),
  ]);
  const sectorTape = await uniqueRss([google, reuters, cnbc, extra], 14);
  const packs = [
    ...tickerPacks,
    sectorTape.map((item) => ({ item, ticker: spec.tickers[0] ?? "" })),
  ];
  const headlines: SectorHeadline[] = [];
  const seen = new Set<string>();
  for (const { item, ticker } of packs.flat()) {
    const key = item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const { impact, lens } = classifyHeadline(item.title, locale);
    headlines.push({
      title: item.title,
      publisher: item.publisher,
      url: item.url,
      publishedAt: item.publishedAt,
      ticker,
      impact,
      lens,
    });
  }
  headlines.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  const top = headlines.slice(0, 12);
  return {
    sector,
    headlines: top,
    beneficiaries: [...new Set(top.filter((h) => h.impact === "beneficiary").map((h) => h.ticker))],
    atRisk: [...new Set(top.filter((h) => h.impact === "at_risk").map((h) => h.ticker))],
  };
}
