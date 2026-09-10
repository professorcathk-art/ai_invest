import { googleNewsUrl, parseRss, uniqueRss, enrichRssSnippets, type RssItem } from "./rss";
import { sourceLabel } from "./deal-sources";
import type { PrivateDeal } from "./private-market";
import { cleanCompanyName, extractRaiseSize, extractValuation, inferDealSector, isUsableCompanyName } from "./private-market";

const DEAL_CORE =
  /\b(acquir\w*|merger|merges|merging|buyout|takeover|series [a-g]\b|seed round|private equity|lbo|spac)\b|收購|併購|融資|私募/;
const DEAL_FUNDING = /\b(raises?|funding|invests?)\b/i;
const DEAL_MONEY = /\$[\d.,]+|\b(million|billion|mn|bn)\b|輪/;

const FIRM = /\b(a16z|andreessen horowitz|y combinator|\byc\b|sequoia|lightspeed|kleiner|bessemer|accel)\b/i;
const FIRM_ACT = /\b(invests?|invested|backs?|backed|leads?|led|launches?|launching|round|valuation|portfolio)\b/i;

export function isDealHeadline(title: string): boolean {
  if (DEAL_CORE.test(title)) return true;
  if (FIRM.test(title) && FIRM_ACT.test(title)) return true;
  return DEAL_FUNDING.test(title) && DEAL_MONEY.test(title);
}

export async function collectDealHeadlines(locale: "en" | "zh" = "en"): Promise<RssItem[]> {
  const query =
    locale === "zh"
      ? "收購 OR 併購 OR 私募 OR 融資 OR 創投 OR a16z OR 紅杉 OR Y Combinator"
      : 'merger OR acquisition OR buyout OR "series B" OR "series C" OR "raises $" OR "private equity" OR a16z OR "Andreessen Horowitz" OR "Y Combinator" OR Sequoia';
  const vcQuery =
    locale === "zh"
      ? '"Y Combinator" OR a16z OR 紅杉資本 (融資 OR 投資 OR 估值)'
      : '"Andreessen Horowitz" OR a16z OR "Y Combinator" OR Sequoia (invests OR invested OR launches OR valuation OR "led the")';
  const [google, vc, techcrunch, crunchbase, reuters, ycBlog] = await Promise.all([
    parseRss(googleNewsUrl(query, locale), "Google News", 16),
    parseRss(googleNewsUrl(vcQuery, locale), "Google News", 12),
    parseRss("https://techcrunch.com/category/venture/feed/", "TechCrunch", 12),
    parseRss("https://news.crunchbase.com/feed/", "Crunchbase News", 12),
    parseRss("https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best", "Reuters", 12),
    parseRss("https://www.ycombinator.com/blog/rss", "Y Combinator", 8),
  ]);
  return enrichRssSnippets(
    (await uniqueRss([google, vc, techcrunch, crunchbase, reuters, ycBlog], 56)).filter((item) =>
      isDealHeadline(item.title),
    ),
    6,
  );
}

export function dealFromHeadline(item: RssItem): PrivateDeal | null {
  if (!isDealHeadline(item.title)) return null;
  const acquire = item.title.match(/(.+?)\s+(?:to\s+)?(?:acquire|buys?|buy out)\s+(.+)/i);
  const merge = item.title.match(/(.+?)\s+(?:to\s+)?merg(?:e|es|ing)\s+with\s+(.+)/i);
  const raise = item.title.match(/(.+?)\s+raises?\s+/i);
  const yc = item.title.match(/(.+?)\s+(?:launches?|is a Y Combinator|joins YC)/i);
  let target = "";
  let acquirer = "";
  let dealType = "M&A / funding";
  let leadInvestors = "";
  if (acquire) {
    acquirer = acquire[1]?.replace(/[:|-].*$/, "").trim() ?? "";
    target = acquire[2]?.split(/[,.(–—]| for | in /i)[0]?.trim() ?? "";
    dealType = "M&A";
  } else if (merge) {
    acquirer = merge[1]?.trim() ?? "";
    target = merge[2]?.split(/[,.(–—]/)[0]?.trim() ?? "";
    dealType = "Merger";
  } else if (raise) {
    target = raise[1]?.replace(/[:|-].*$/, "").trim() ?? "";
    dealType = /series [a-g]/i.test(item.title) ? "Venture round" : "Funding";
    if (/\b(a16z|andreessen)\b/i.test(item.title)) leadInvestors = "a16z";
    else if (/\by combinator|\byc\b/i.test(item.title)) leadInvestors = "Y Combinator";
    else if (/\bsequoia\b/i.test(item.title)) leadInvestors = "Sequoia";
  } else if (yc) {
    target = yc[1]?.replace(/[:|-].*$/, "").trim() ?? "";
    dealType = "YC launch";
    leadInvestors = "Y Combinator";
  } else {
    return null;
  }
  target = cleanCompanyName(target);
  acquirer = cleanCompanyName(acquirer);
  if (!isUsableCompanyName(target)) return null;
  const url = item.url;
  return {
    id: `${item.publisher}-${target}`.slice(0, 160),
    announcedOn: item.publishedAt,
    target,
    acquirer: acquirer && acquirer !== target ? acquirer : "",
    sector: inferDealSector("", target, acquirer, item.title, item.summary ?? ""),
    dealType,
    dealSize: extractRaiseSize(item.title),
    valuation: extractValuation(item.title),
    leadInvestors,
    sources: url ? [{ label: sourceLabel(url, item.publisher, item.title), url }] : [],
    url,
  };
}

export async function fetchPrivateDealHeadlines(locale: "en" | "zh" = "en"): Promise<PrivateDeal[]> {
  const items = await collectDealHeadlines(locale);
  return items.map(dealFromHeadline).filter((row): row is PrivateDeal => row != null);
}
