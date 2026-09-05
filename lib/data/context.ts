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

export interface CompanyContext {
  businessSummary: string;
  news: NewsItem[];
  highlights: CompanyHighlight[];
}

export const emptyContext = (): CompanyContext => ({
  businessSummary: "",
  news: [],
  highlights: [],
});

function client() {
  return import("yahoo-finance2").then((mod) => new mod.default({ suppressNotices: ["yahooSurvey"] }));
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

async function fmpNews(symbol: string): Promise<NewsItem[]> {
  const rows = await fmpJson<
    Array<{ title?: string; text?: string; site?: string; url?: string; publishedDate?: string }>
  >(`/stock_news?tickers=${encodeURIComponent(symbol)}&limit=6`);
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 6).map((row) => ({
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

export async function fetchCompanyContext(symbol: string): Promise<CompanyContext> {
  const news: NewsItem[] = [];
  const highlights: CompanyHighlight[] = [];
  let businessSummary = "";
  try {
    const yf = await client();
    const [search, summary] = await Promise.all([
      yf.search(symbol, { quotesCount: 1, newsCount: 8 }),
      yf.quoteSummary(symbol, { modules: ["assetProfile", "summaryProfile"] }).catch(() => null),
    ]);
    for (const item of (search.news ?? []) as Array<Record<string, unknown>>) {
      const published = item.providerPublishTime ?? item.publishedAt;
      news.push({
        title: String(item.title ?? ""),
        publisher: String(item.publisher ?? "Yahoo Finance"),
        url: String(item.link ?? item.url ?? ""),
        publishedAt: published ? new Date(published as Date | number | string).toISOString() : null,
      });
    }
    const profile = (summary?.assetProfile ?? summary?.summaryProfile) as
      | {
          longBusinessSummary?: string;
          sector?: string;
          industry?: string;
          country?: string;
          fullTimeEmployees?: number | string;
          website?: string;
        }
      | undefined;
    businessSummary = profile?.longBusinessSummary ?? "";
    pushHighlight(highlights, "Sector", profile?.sector);
    pushHighlight(highlights, "Industry", profile?.industry);
    pushHighlight(highlights, "Country", profile?.country);
    pushHighlight(highlights, "Employees", profile?.fullTimeEmployees);
    pushHighlight(highlights, "Website", profile?.website);
  } catch {
    // Yahoo context is optional.
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
  >(`/profile/${encodeURIComponent(symbol)}?`);
  const fp = Array.isArray(fmpProfile) ? fmpProfile[0] : undefined;
  if (fp) {
    if (!businessSummary && fp.description) businessSummary = fp.description;
    pushHighlight(highlights, "Company", fp.companyName);
    pushHighlight(highlights, "CEO", fp.ceo);
    pushHighlight(highlights, "Sector", fp.sector);
    pushHighlight(highlights, "Industry", fp.industry);
    pushHighlight(highlights, "Country", fp.country);
    pushHighlight(highlights, "Employees", fp.fullTimeEmployees);
    pushHighlight(highlights, "Website", fp.website);
  }

  if (news.length === 0) {
    news.push(...(await fmpNews(symbol)));
  }

  const seen = new Set<string>();
  const uniqueHighlights = highlights.filter((h) => {
    const key = `${h.label}:${h.value}`;
    if (seen.has(key) || seen.has(h.label)) return false;
    seen.add(key);
    seen.add(h.label);
    return true;
  });

  return {
    businessSummary: businessSummary.slice(0, 1800),
    news: news.filter((n) => n.title).slice(0, 6),
    highlights: uniqueHighlights.slice(0, 8),
  };
}

export function contextBrief(ctx: CompanyContext): string {
  const headlines = ctx.news
    .map((n, i) => `${i + 1}. ${n.title}${n.publisher ? ` (${n.publisher})` : ""}`)
    .join("\n");
  const facts = ctx.highlights.map((h) => `- ${h.label}: ${h.value}`).join("\n");
  return [
    ctx.businessSummary ? `Business overview:\n${ctx.businessSummary}` : "Business overview: not available.",
    facts ? `Key facts:\n${facts}` : "",
    headlines ? `Recent headlines:\n${headlines}` : "Recent headlines: none available.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
