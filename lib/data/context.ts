import type { Locale } from "@/lib/i18n/messages";
import { isHkTicker, normalizeSymbol } from "./normalize";

export interface NewsItem {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
}

export interface CompanyHighlight {
  label: string;
  value: string;
}

export interface SourceRef {
  title: string;
  source: string;
  url: string;
  kind: "filing" | "report" | "news" | "holder";
}

export interface CompanyContext {
  businessSummary: string;
  news: NewsItem[];
  highlights: CompanyHighlight[];
  references: SourceRef[];
}

export const emptyContext = (): CompanyContext => ({
  businessSummary: "",
  news: [],
  highlights: [],
  references: [],
});

function client() {
  return import("yahoo-finance2").then((mod) => new mod.default({ suppressNotices: ["yahooSurvey"] }));
}

export function isTickerRelatedHeadline(title: string, ticker: string, name: string): boolean {
  const t = title.toLowerCase();
  const sym = normalizeSymbol(ticker).toLowerCase();
  const code = sym.split(".")[0]?.replace(/^0+/, "") ?? "";
  if (t.includes(sym) || (code.length >= 3 && t.includes(code))) return true;
  const tokens = name
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((tok) => tok.length > 2 && !["inc", "ltd", "plc", "corp", "group", "holdings", "the"].includes(tok));
  return tokens.some((tok) => t.includes(tok));
}

async function fmpJson<T>(path: string): Promise<T | null> {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://financialmodelingprep.com/api/v3${path}&apikey=${key}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function parseRss(url: string, publisher: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: NewsItem[] = [];
    const blocks = xml.split(/<item>/i).slice(1);
    for (const block of blocks) {
      const title = decodeXml(block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? "");
      const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
      const pub = decodeXml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
      if (!title) continue;
      items.push({
        title,
        publisher,
        url: link.trim(),
        publishedAt: pub ? new Date(pub).toISOString() : null,
      });
    }
    return items.slice(0, 8);
  } catch {
    return [];
  }
}

async function yahooRssNews(symbol: string): Promise<NewsItem[]> {
  return parseRss(
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
    "Yahoo Finance",
  );
}

async function googleNewsRss(ticker: string, name: string, locale: Locale): Promise<NewsItem[]> {
  const query = `"${name}" OR ${ticker} (earnings OR results OR annual OR 業績 OR 年報)`;
  const hl = locale === "zh" ? "zh-HK" : "en-US";
  const gl = locale === "zh" ? "HK" : "US";
  const items = await parseRss(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl}`,
    "Google News",
  );
  return items.filter((item) => isTickerRelatedHeadline(item.title, ticker, name));
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function fmpNews(symbol: string): Promise<NewsItem[]> {
  const rows = await fmpJson<
    Array<{ title?: string; text?: string; site?: string; url?: string; publishedDate?: string }>
  >(`/stock_news?tickers=${encodeURIComponent(symbol)}&limit=8`);
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 8).map((row) => ({
    title: row.title || row.text || "Untitled",
    publisher: row.site || "FMP",
    url: row.url || "",
    publishedAt: row.publishedDate ?? null,
  }));
}

function pushHighlight(list: CompanyHighlight[], label: string, value: unknown) {
  const text = value == null ? "" : String(value).trim();
  if (text && text !== "undefined" && text !== "null") list.push({ label, value: text });
}

function pushRef(list: SourceRef[], ref: SourceRef) {
  if (!ref.title || !ref.url) return;
  if (list.some((item) => item.url === ref.url || item.title === ref.title)) return;
  list.push(ref);
}

function filingLinks(ticker: string, name: string): SourceRef[] {
  const symbol = normalizeSymbol(ticker);
  const code = symbol.replace(/\.HK$/i, "").replace(/^0+/, "") || symbol;
  const q = encodeURIComponent(`${name} ${symbol}`);
  const refs: SourceRef[] = [
    {
      title: `${name} investor relations / annual report search`,
      source: "Company IR",
      url: `https://www.google.com/search?q=${encodeURIComponent(`${name} investor relations annual report`)}`,
      kind: "report",
    },
    {
      title: `Financial Times coverage — ${symbol}`,
      source: "Financial Times",
      url: `https://www.ft.com/search?q=${q}`,
      kind: "news",
    },
    {
      title: `Reuters coverage — ${symbol}`,
      source: "Reuters",
      url: `https://www.reuters.com/site-search/?query=${q}`,
      kind: "news",
    },
    {
      title: `Bloomberg coverage — ${symbol}`,
      source: "Bloomberg",
      url: `https://www.bloomberg.com/search?query=${q}`,
      kind: "news",
    },
    {
      title: `${symbol} Yahoo Finance financials`,
      source: "Yahoo Finance",
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/financials`,
      kind: "report",
    },
  ];
  if (isHkTicker(symbol)) {
    refs.push({
      title: `${name} HKEX announcements / annual results`,
      source: "HKEX",
      url: `https://www1.hkexnews.hk/search/titlesearch.xhtml?lang=en`,
      kind: "filing",
    });
    refs.push({
      title: `${symbol} HKEX quote`,
      source: "HKEX",
      url: `https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=${encodeURIComponent(code)}&sc_lang=en`,
      kind: "report",
    });
  } else {
    refs.push({
      title: `${name} SEC EDGAR filings (10-K, 10-Q, 8-K, 13G/D)`,
      source: "SEC EDGAR",
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(name)}&type=&dateb=&owner=exclude&count=10`,
      kind: "filing",
    });
    refs.push({
      title: `Institutional 13F holder search — ${symbol}`,
      source: "SEC EDGAR",
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(name)}&type=13F&dateb=&owner=include&count=10`,
      kind: "holder",
    });
  }
  return refs;
}

export async function fetchCompanyContext(symbol: string, locale: Locale = "en"): Promise<CompanyContext> {
  const ticker = normalizeSymbol(symbol);
  const news: NewsItem[] = [];
  const highlights: CompanyHighlight[] = [];
  const references: SourceRef[] = [];
  let businessSummary = "";
  let companyName = ticker;

  try {
    const yf = await client();
    const [rss, summary, insights] = await Promise.all([
      yahooRssNews(ticker),
      yf
        .quoteSummary(ticker, {
          modules: ["assetProfile", "summaryProfile", "secFilings", "institutionOwnership"],
        })
        .catch(() => null),
      yf.insights(ticker).catch(() => null),
    ]);

    const profile = (summary?.assetProfile ?? summary?.summaryProfile) as
      | {
          longBusinessSummary?: string;
          sector?: string;
          industry?: string;
          country?: string;
          fullTimeEmployees?: number | string;
          website?: string;
          irWebsite?: string;
          name?: string;
        }
      | undefined;
    businessSummary = profile?.longBusinessSummary ?? "";
    companyName = profile?.name || companyName;
    pushHighlight(highlights, "Sector", profile?.sector);
    pushHighlight(highlights, "Industry", profile?.industry);
    pushHighlight(highlights, "Country", profile?.country);
    pushHighlight(highlights, "Employees", profile?.fullTimeEmployees);
    pushHighlight(highlights, "Website", profile?.website);
    if (profile?.website) {
      pushRef(references, {
        title: `${companyName} corporate website`,
        source: "Company",
        url: profile.website,
        kind: "report",
      });
    }
    if (profile?.irWebsite) {
      pushRef(references, {
        title: `${companyName} investor relations`,
        source: "Company IR",
        url: profile.irWebsite,
        kind: "report",
      });
    }

    for (const filing of summary?.secFilings?.filings ?? []) {
      const type = String(filing.type ?? "");
      if (!/10-K|10-Q|20-F|6-K|8-K|13F|13G|13D|ARS|DEF 14A/i.test(type)) continue;
      pushRef(references, {
        title: `${type} — ${filing.title || type}`,
        source: "SEC EDGAR",
        url: filing.edgarUrl || filing.url || "",
        kind: "filing",
      });
    }

    const holders = (summary?.institutionOwnership as { ownershipList?: Array<{ organization?: string; pctHeld?: number }> } | undefined)
      ?.ownershipList;
    if (Array.isArray(holders)) {
      for (const holder of holders.slice(0, 3)) {
        if (!holder.organization) continue;
        pushHighlight(
          highlights,
          "Top holder",
          `${holder.organization}${holder.pctHeld != null ? ` (${(holder.pctHeld * 100).toFixed(1)}%)` : ""}`,
        );
      }
    }

    news.push(...rss);

    const developments = (insights as { sigDevs?: Array<{ headline?: string; date?: string | Date }> } | null)?.sigDevs;
    for (const dev of developments ?? []) {
      if (!dev.headline) continue;
      if (!isTickerRelatedHeadline(dev.headline, ticker, companyName)) continue;
      news.push({
        title: dev.headline,
        publisher: "Yahoo Insights",
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/news`,
        publishedAt: dev.date ? new Date(dev.date).toISOString() : null,
      });
    }
  } catch {
    // Public context is optional.
  }

  const fmpProfile = await fmpJson<
    Array<{
      description?: string;
      sector?: string;
      industry?: string;
      country?: string;
      ceo?: string;
      fullTimeEmployees?: string | number;
      website?: string;
      companyName?: string;
    }>
  >(`/profile/${encodeURIComponent(ticker)}?`);
  const fp = Array.isArray(fmpProfile) ? fmpProfile[0] : undefined;
  if (fp) {
    companyName = fp.companyName || companyName;
    if (!businessSummary && fp.description) businessSummary = fp.description;
    pushHighlight(highlights, "Company", fp.companyName);
    pushHighlight(highlights, "CEO", fp.ceo);
    pushHighlight(highlights, "Sector", fp.sector);
    pushHighlight(highlights, "Industry", fp.industry);
    pushHighlight(highlights, "Country", fp.country);
    pushHighlight(highlights, "Employees", fp.fullTimeEmployees);
    pushHighlight(highlights, "Website", fp.website);
  }

  const google = await googleNewsRss(ticker, companyName, locale);
  news.push(...google);

  if (news.length < 3) {
    const extras = await fmpNews(ticker);
    news.push(...extras.filter((item) => isTickerRelatedHeadline(item.title, ticker, companyName)));
  }

  for (const link of filingLinks(ticker, companyName)) pushRef(references, link);

  const seenNews = new Set<string>();
  const uniqueNews = news.filter((item) => {
    const key = item.title.toLowerCase();
    if (!item.title || seenNews.has(key)) return false;
    seenNews.add(key);
    return true;
  });

  const seenHi = new Set<string>();
  const uniqueHighlights = highlights.filter((h) => {
    if (seenHi.has(h.label) && h.label !== "Top holder") return false;
    if (h.label !== "Top holder") seenHi.add(h.label);
    return true;
  });

  return {
    businessSummary: businessSummary.slice(0, 1800),
    news: uniqueNews.slice(0, 6),
    highlights: uniqueHighlights.slice(0, 8),
    references: references.slice(0, 14),
  };
}

export function contextBrief(ctx: CompanyContext): string {
  const headlines = ctx.news
    .map((n, i) => `${i + 1}. ${n.title}${n.publisher ? ` (${n.publisher})` : ""}`)
    .join("\n");
  const facts = ctx.highlights.map((h) => `- ${h.label}: ${h.value}`).join("\n");
  const refs = ctx.references.map((r, i) => `${i + 1}. [${r.kind}] ${r.title} — ${r.source} (${r.url})`).join("\n");
  return [
    ctx.businessSummary ? `Business overview:\n${ctx.businessSummary}` : "Business overview: not available.",
    facts ? `Key facts:\n${facts}` : "",
    headlines
      ? `Recent company headlines (digest into business events / market catalysts; do not paste titles verbatim):\n${headlines}`
      : "Recent headlines: none available.",
    refs ? `Primary public sources (use as background; do not invent filings or paste titles verbatim):\n${refs}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
