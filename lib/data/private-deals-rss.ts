import { googleNewsUrl, parseRss, uniqueRss, type RssItem } from "./rss";
import type { PrivateDeal } from "./private-market";

const DEAL_CORE =
  /\b(acquir\w*|merger|merges|merging|buyout|takeover|series [a-g]\b|seed round|private equity|lbo|spac)\b|收購|併購|融資|私募/;
const DEAL_FUNDING =
  /\b(raises?|funding|invests?)\b/i;
const DEAL_MONEY = /\$[\d.,]+|\b(million|billion|mn|bn)\b|輪/;

export function isDealHeadline(title: string): boolean {
  if (DEAL_CORE.test(title)) return true;
  return DEAL_FUNDING.test(title) && DEAL_MONEY.test(title);
}

export function dealFromHeadline(item: RssItem): PrivateDeal | null {
  if (!isDealHeadline(item.title)) return null;
  const money = item.title.match(/\$[\d.,]+\s*(billion|million|bn|mn|b|m)?/i)?.[0] ?? "";
  const acquire = item.title.match(/(.+?)\s+(?:to\s+)?(?:acquire|buys?|buy out)\s+(.+)/i);
  const merge = item.title.match(/(.+?)\s+(?:to\s+)?merg(?:e|es|ing)\s+with\s+(.+)/i);
  const raise = item.title.match(/(.+?)\s+raises?\s+/i);
  let target = "";
  let acquirer = "";
  let dealType = "M&A / funding";
  if (acquire) {
    acquirer = acquire[1]?.replace(/[:|-].*$/, "").trim() ?? "";
    target = acquire[2]?.split(/[,.(–—]| for | in /i)[0]?.trim() ?? "";
    dealType = "M&A";
  } else if (merge) {
    acquirer = merge[1]?.trim() ?? "";
    target = merge[2]?.split(/[,.(–—]/)[0]?.trim() ?? "";
    dealType = "Merger";
  } else if (raise) {
    target = raise[1]?.replace(/[:|-].*$/, "").trim() ?? item.title.slice(0, 80);
    dealType = /series [a-g]/i.test(item.title) ? "Venture round" : "Funding";
  } else {
    target = item.title.slice(0, 96);
  }
  if (!target) return null;
  return {
    id: `${item.publisher}-${item.title}`.slice(0, 160),
    announcedOn: item.publishedAt,
    target,
    acquirer,
    sector: "",
    dealType,
    dealSize: money,
    leadInvestors: "",
    url: item.url,
  };
}

export async function fetchPrivateDealHeadlines(locale: "en" | "zh" = "en"): Promise<PrivateDeal[]> {
  const query =
    locale === "zh"
      ? "收購 OR 併購 OR 私募 OR 融資 OR 創投 OR Series A"
      : 'merger OR acquisition OR buyout OR "series B" OR "series C" OR "raises $" OR "private equity"';
  const [google, techcrunch, crunchbase, reuters] = await Promise.all([
    parseRss(googleNewsUrl(query, locale), "Google News", 16),
    parseRss("https://techcrunch.com/category/venture/feed/", "TechCrunch", 12),
    parseRss("https://news.crunchbase.com/feed/", "Crunchbase News", 12),
    parseRss("https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best", "Reuters", 12),
  ]);
  const items = await uniqueRss([google, techcrunch, crunchbase, reuters], 40);
  const deals = items.map(dealFromHeadline).filter((row): row is PrivateDeal => row != null);
  const seen = new Set<string>();
  return deals.filter((deal) => {
    const key = `${deal.target}|${deal.acquirer}|${deal.dealSize}|${deal.announcedOn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
