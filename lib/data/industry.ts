import type { Locale } from "@/lib/i18n/messages";
import { fetchPublicHeadlines } from "./context";
import {
  INDUSTRY_SECTORS,
  classifyHeadline,
  type IndustrySectorId,
  type SectorHeadline,
  type SectorResearch,
} from "./industry-sectors";

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
  const packs = await Promise.all(
    spec.tickers.slice(0, 3).map(async (ticker) => {
      const news = await fetchPublicHeadlines(ticker, locale);
      return news.map((item) => ({ item, ticker }));
    }),
  );
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
