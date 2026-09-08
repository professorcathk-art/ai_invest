import type { CompanyFinancials } from "@/lib/engines/types";
import { fmpKey, fmpStable } from "./fmp-client";
import {
  assembleYears,
  buildQuote,
  defaultTaxRate,
  finalizeCompany,
  mergeRawYears,
  normalizeSymbol,
  type RawYear,
} from "./normalize";

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
}

export function fmpStatementYear(rec: Record<string, unknown>): number {
  const direct = Number(rec.fiscalYear ?? rec.calendarYear ?? rec.year ?? 0);
  if (direct > 1990) return direct;
  const date = String(rec.date ?? rec.filingDate ?? rec.fillingDate ?? "");
  const y = Number(date.slice(0, 4));
  return y > 1990 ? y : 0;
}

function asRows(raw: unknown): RawYear[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const rec = (row ?? {}) as Record<string, unknown>;
      const year = fmpStatementYear(rec);
      return { ...rec, year, calendarYear: year } as RawYear;
    })
    .filter((row) => Number(row.year) > 1990);
}

export async function searchFmp(query: string): Promise<SearchHit[]> {
  const rows = await fmpStable<Array<{ symbol?: string; name?: string; exchange?: string; exchangeFullName?: string }>>(
    `/search-symbol?query=${encodeURIComponent(query)}&limit=8`,
  );
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r.symbol)
    .map((r) => ({
      symbol: String(r.symbol),
      name: String(r.name ?? r.symbol),
      exchange: String(r.exchange ?? r.exchangeFullName ?? ""),
    }));
}

export async function fetchFmpCompany(symbol: string): Promise<CompanyFinancials | null> {
  if (!fmpKey()) return null;
  const ticker = normalizeSymbol(symbol);
  const warnings: string[] = [];
  const encoded = encodeURIComponent(ticker);

  const income = await fmpStable<unknown>(`/income-statement?symbol=${encoded}&period=FY&limit=5`);
  const incomeRows = asRows(income);
  if (incomeRows.length === 0) return null;

  const [balance, cash, quoteRows, profileRows, metrics] = await Promise.all([
    fmpStable<unknown>(`/balance-sheet-statement?symbol=${encoded}&period=FY&limit=5`),
    fmpStable<unknown>(`/cash-flow-statement?symbol=${encoded}&period=FY&limit=5`),
    fmpStable<Array<Record<string, unknown>>>(`/quote?symbol=${encoded}`),
    fmpStable<Array<Record<string, unknown>>>(`/profile?symbol=${encoded}`),
    fmpStable<Array<Record<string, unknown>>>(`/key-metrics?symbol=${encoded}&period=FY&limit=5`),
  ]);

  const merged = mergeRawYears([incomeRows, asRows(balance), asRows(cash)]);
  if (Array.isArray(metrics)) {
    for (const m of metrics) {
      const year = fmpStatementYear(m);
      const existing = merged.find((row) => Number(row.year ?? row.calendarYear) === year);
      const roic = Number(m.returnOnInvestedCapital ?? m.roic ?? 0);
      if (existing && roic) existing.roic = Math.abs(roic) > 2 ? roic / 100 : roic;
    }
  }

  const years = assembleYears(merged, defaultTaxRate(ticker), warnings);
  if (years.length === 0) return null;
  const q = quoteRows?.[0] ?? {};
  const p = profileRows?.[0] ?? {};
  const last = years.at(-1);
  const m0 = metrics?.[0] ?? {};

  const quote = buildQuote(
    ticker,
    {
      name: String(p.companyName ?? q.name ?? ticker),
      exchange: String(p.exchange ?? p.exchangeFullName ?? q.exchange ?? ""),
      price: Number(q.price ?? p.price ?? 0),
      marketCap: Number(q.marketCap ?? p.marketCap ?? 0),
      enterpriseValue: Number(m0.enterpriseValue ?? 0),
      pe: Number(q.pe ?? 0) || null,
      evEbitda: Number(m0.evToEBITDA ?? m0.enterpriseValueOverEBITDA ?? 0) || null,
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
