import type { CompanyFinancials } from "@/lib/engines/types";
import {
  assembleYears,
  buildQuote,
  finalizeCompany,
  mergeRawYears,
  normalizeSymbol,
  type RawYear,
} from "./normalize";

const BASE = "https://financialmodelingprep.com/api/v3";

function key(): string | undefined {
  return process.env.FMP_API_KEY;
}

async function fmp<T>(path: string): Promise<T | null> {
  const apikey = key();
  if (!apikey) return null;
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}apikey=${apikey}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
}

export async function searchFmp(query: string): Promise<SearchHit[]> {
  const rows = await fmp<Array<{ symbol: string; name: string; exchangeShortName?: string; stockExchange?: string }>>(
    `/search?query=${encodeURIComponent(query)}&limit=8`,
  );
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    exchange: r.exchangeShortName ?? r.stockExchange ?? "",
  }));
}

export async function fetchFmpCompany(symbol: string): Promise<CompanyFinancials | null> {
  if (!key()) return null;
  const ticker = normalizeSymbol(symbol);
  const warnings: string[] = [];

  const [income, balance, cash, quoteRows, profileRows, metrics] = await Promise.all([
    fmp<RawYear[]>(`/income-statement/${ticker}?period=annual&limit=8`),
    fmp<RawYear[]>(`/balance-sheet-statement/${ticker}?period=annual&limit=8`),
    fmp<RawYear[]>(`/cash-flow-statement/${ticker}?period=annual&limit=8`),
    fmp<Array<Record<string, unknown>>>(`/quote/${ticker}`),
    fmp<Array<Record<string, unknown>>>(`/profile/${ticker}`),
    fmp<Array<Record<string, unknown>>>(`/key-metrics/${ticker}?period=annual&limit=8`),
  ]);

  if (!income || !Array.isArray(income) || income.length === 0) return null;

  const merged = mergeRawYears([income, balance, cash]);
  if (metrics) {
    for (const m of metrics) {
      const year = Number(m.calendarYear ?? m.year ?? 0);
      const existing = merged.find((row) => Number(row.year ?? row.calendarYear) === year);
      if (existing && Number(m.roic ?? 0)) existing.roic = Number(m.roic);
    }
  }

  const { defaultTaxRate } = await import("./normalize");
  const years = assembleYears(merged, defaultTaxRate(ticker), warnings);
  const q = quoteRows?.[0] ?? {};
  const p = profileRows?.[0] ?? {};
  const last = years.at(-1);

  const quote = buildQuote(
    ticker,
    {
      name: String(p.companyName ?? q.name ?? ticker),
      exchange: String(p.exchangeShortName ?? ""),
      price: Number(q.price ?? p.price ?? 0),
      marketCap: Number(q.marketCap ?? p.mktCap ?? 0),
      enterpriseValue: Number((metrics?.[0] as { enterpriseValue?: number } | undefined)?.enterpriseValue ?? 0),
      pe: Number(q.pe ?? 0) || null,
      evEbitda: Number((metrics?.[0] as { enterpriseValueOverEBITDA?: number } | undefined)?.enterpriseValueOverEBITDA ?? 0) || null,
      beta: Number(p.beta ?? 1),
      sharesOutstanding: Number(q.sharesOutstanding ?? last?.shares ?? 0),
      currency: String(p.currency ?? "USD"),
      sector: String(p.sector ?? ""),
    },
    last,
  );

  if (!quote.price) warnings.push("Quote price missing from FMP — using last close fallback of 0.");
  return finalizeCompany("fmp", ticker, quote, years, warnings);
}
