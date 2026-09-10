import type { Locale } from "@/lib/i18n/messages";
import { filingExcerptBrief, filingLabel } from "./filings";
import { listCompanyFilings } from "./filings-store";
import { fmpStable } from "./fmp-client";
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
  ownershipBrief?: string;
  segmentBrief?: string;
  filingBrief?: string;
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

async function parseRss(url: string, publisher: string): Promise<NewsItem[]> {
  const { parseRss: parse } = await import("./rss");
  return parse(url, publisher, 8);
}

async function yahooRssNews(symbol: string, locale: Locale = "en"): Promise<NewsItem[]> {
  const lang = locale === "zh" ? "zh-Hant-HK" : "en-US";
  const region = locale === "zh" && isHkTicker(symbol) ? "HK" : "US";
  return parseRss(
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=${region}&lang=${lang}`,
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

function pushHighlight(list: CompanyHighlight[], label: string, value: unknown) {
  const text = value == null ? "" : String(value).trim();
  if (text && text !== "undefined" && text !== "null") list.push({ label, value: text });
}

function pushRef(list: SourceRef[], ref: SourceRef) {
  if (!ref.title || !ref.url) return;
  if (list.some((item) => item.url === ref.url || item.title === ref.title)) return;
  list.push(ref);
}

function filingLinks(ticker: string, name: string, hasStoredAnnual = false): SourceRef[] {
  const symbol = normalizeSymbol(ticker);
  const code = symbol.replace(/\.HK$/i, "").replace(/^0+/, "") || symbol;
  const q = encodeURIComponent(`${name} ${symbol}`);
  const refs: SourceRef[] = [];
  if (!hasStoredAnnual) {
    refs.push({
      title: `${name} investor relations / annual report search`,
      source: "Company IR",
      url: `https://www.google.com/search?q=${encodeURIComponent(`${name} investor relations annual report`)}`,
      kind: "report",
    });
  }
  refs.push(
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
  );
  if (isHkTicker(symbol)) {
    if (!hasStoredAnnual) {
      refs.push({
        title: `${name} HKEX announcements / annual results`,
        source: "HKEX",
        url: `https://www1.hkexnews.hk/search/titlesearch.xhtml?lang=en`,
        kind: "filing",
      });
    }
    refs.push({
      title: `${symbol} HKEX quote`,
      source: "HKEX",
      url: `https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=${encodeURIComponent(code)}&sc_lang=en`,
      kind: "report",
    });
  } else {
    if (!hasStoredAnnual) {
      refs.push({
        title: `${name} SEC EDGAR filings (10-K, 10-Q, 8-K, 13G/D)`,
        source: "SEC EDGAR",
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(name)}&type=&dateb=&owner=exclude&count=10`,
        kind: "filing",
      });
    }
    refs.push({
      title: `Institutional 13F holder search — ${symbol}`,
      source: "SEC EDGAR",
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(name)}&type=13F&dateb=&owner=include&count=10`,
      kind: "holder",
    });
  }
  return refs;
}

async function extraCompanyRss(ticker: string, name: string, locale: Locale): Promise<NewsItem[]> {
  const q = `"${name}" OR ${ticker}`;
  const { googleNewsUrl, parseRss: parse } = await import("./rss");
  const [reuters, marketwatch] = await Promise.all([
    parse(googleNewsUrl(`${q} site:reuters.com`, locale), "Reuters", 6),
    parse(googleNewsUrl(`${q} site:marketwatch.com`, locale), "MarketWatch", 6),
  ]);
  return [...reuters, ...marketwatch].filter((item) => isTickerRelatedHeadline(item.title, ticker, name));
}

export async function fetchPublicHeadlines(symbol: string, locale: Locale = "en"): Promise<NewsItem[]> {
  const ticker = normalizeSymbol(symbol);
  const [yahoo, google, extra] = await Promise.all([
    yahooRssNews(ticker, locale),
    googleNewsRss(ticker, ticker, locale),
    extraCompanyRss(ticker, ticker, locale),
  ]);
  const seen = new Set<string>();
  return [...yahoo, ...google, ...extra].filter((item) => {
    const key = item.title.toLowerCase();
    if (!item.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

export async function fetchCompanyContext(symbol: string, locale: Locale = "en"): Promise<CompanyContext> {
  const ticker = normalizeSymbol(symbol);
  const news: NewsItem[] = [];
  const highlights: CompanyHighlight[] = [];
  const references: SourceRef[] = [];
  let businessSummary = "";
  let companyName = ticker;
  const storedFilings = await listCompanyFilings(ticker, 6);
  for (const filing of storedFilings) {
    pushRef(references, {
      title: filing.title || filingLabel(filing),
      source: filing.docType === "annual_report" ? "HKEX / stored" : "SEC / stored",
      url: filing.publicUrl,
      kind: "filing",
    });
  }

  try {
    const yf = await client();
    const [rss, summary, insights] = await Promise.all([
      yahooRssNews(ticker, locale),
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

  const fmpProfile = await fmpStable<
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
  >(`/profile?symbol=${encodeURIComponent(ticker)}`);
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

  const [google, extra] = await Promise.all([
    googleNewsRss(ticker, companyName, locale),
    extraCompanyRss(ticker, companyName, locale),
  ]);
  news.push(...google, ...extra);

  for (const link of filingLinks(ticker, companyName, storedFilings.length > 0)) pushRef(references, link);

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
    news: uniqueNews.slice(0, 10),
    highlights: uniqueHighlights.slice(0, 8),
    references: references.slice(0, 14),
    filingBrief: filingExcerptBrief(storedFilings),
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
    ctx.segmentBrief
      ? `Sourced business segments / geography (background — not a citation mandate):\n${ctx.segmentBrief}`
      : "Sourced business segments: none in this packet. Do not invent a mix.",
    ctx.ownershipBrief
      ? `Ownership / CCASS / 13F (use these figures only; do not invent holdings):\n${ctx.ownershipBrief}`
      : "",
    ctx.filingBrief
      ? `Sourced annual-report / 10-K excerpt (use for product, technology, and operating detail; do not invent process steps that are not here):\n${ctx.filingBrief}`
      : "Sourced annual-report excerpt: none in this packet. Do not invent plant, process, or product-architecture details.",
    refs ? `Primary public sources (use as background; do not invent filings or paste titles verbatim):\n${refs}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
