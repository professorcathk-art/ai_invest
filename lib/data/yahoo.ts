import type { CompanyFinancials } from "@/lib/engines/types";
import {
  assembleYears,
  buildQuote,
  defaultTaxRate,
  finalizeCompany,
  normalizeSymbol,
  type RawYear,
} from "./normalize";
import type { SearchHit } from "./fmp";

function client() {
  return import("yahoo-finance2").then((mod) => new mod.default({ suppressNotices: ["yahooSurvey"] }));
}

export async function searchYahoo(query: string): Promise<SearchHit[]> {
  try {
    const yf = await client();
    const result = await yf.search(query, { quotesCount: 8, newsCount: 0 });
    return (result.quotes ?? [])
      .filter((q) => "symbol" in q && q.symbol)
      .map((q) => ({
        symbol: String(q.symbol),
        name: String(("shortname" in q && q.shortname) || ("longname" in q && q.longname) || q.symbol),
        exchange: String(("exchange" in q && q.exchange) || ""),
      }));
  } catch {
    return [];
  }
}

function n(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function seriesNum(row: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    if (row[key] != null && Number.isFinite(Number(row[key]))) return n(row[key]);
    const annual = `annual${key[0]?.toUpperCase()}${key.slice(1)}`;
    if (row[annual] != null && Number.isFinite(Number(row[annual]))) return n(row[annual]);
  }
  return 0;
}

function seriesYear(row: Record<string, unknown>): number {
  const raw = row.date ?? row.asOfDate ?? row.endDate;
  if (raw instanceof Date) return raw.getUTCFullYear();
  if (typeof raw === "string" || typeof raw === "number") {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.getUTCFullYear();
  }
  return 0;
}

export async function fetchYahooCompany(symbol: string): Promise<CompanyFinancials | null> {
  const ticker = normalizeSymbol(symbol);
  const warnings: string[] = ["Yahoo Finance fallback — some fields may be incomplete."];
  try {
    const yf = await client();
    const period1 = new Date();
    period1.setUTCFullYear(period1.getUTCFullYear() - 5);

    const [quote, summary, series] = await Promise.all([
      yf.quote(ticker),
      yf.quoteSummary(ticker, {
        modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData"],
      }),
      yf
        .fundamentalsTimeSeries(ticker, {
          period1: period1.toISOString().slice(0, 10),
          type: "annual",
          module: "all",
        })
        .catch(() => []),
    ]);

    const byYear = new Map<number, RawYear>();
    for (const item of series ?? []) {
      const row = item as unknown as Record<string, unknown>;
      const year = seriesYear(row);
      if (!year) continue;
      const cur = byYear.get(year) ?? { year };
      cur.date = `${year}-12-31`;
      cur.calendarYear = year;
      cur.revenue = seriesNum(row, "totalRevenue", "operatingRevenue") || cur.revenue;
      cur.grossProfit = seriesNum(row, "grossProfit") || cur.grossProfit;
      cur.ebit = seriesNum(row, "EBIT", "operatingIncome") || cur.ebit;
      cur.ebitda = seriesNum(row, "EBITDA", "normalizedEBITDA") || cur.ebitda;
      cur.depreciationAndAmortization =
        seriesNum(row, "depreciationAndAmortization", "reconciledDepreciation") ||
        cur.depreciationAndAmortization;
      cur.capitalExpenditure = Math.abs(seriesNum(row, "capitalExpenditure", "purchaseOfPPE")) || cur.capitalExpenditure;
      cur.changeInWorkingCapital = seriesNum(row, "changeInWorkingCapital") || cur.changeInWorkingCapital;
      cur.incomeTaxExpense = seriesNum(row, "taxProvision") || cur.incomeTaxExpense;
      cur.incomeBeforeTax = seriesNum(row, "pretaxIncome") || cur.incomeBeforeTax;
      cur.interestExpense = seriesNum(row, "interestExpense", "interestExpenseNonOperating") || cur.interestExpense;
      cur.netIncome = seriesNum(row, "netIncome") || cur.netIncome;
      cur.totalDebt = seriesNum(row, "totalDebt") || cur.totalDebt;
      cur.cashAndCashEquivalents = seriesNum(row, "cashAndCashEquivalents") || cur.cashAndCashEquivalents;
      cur.totalStockholdersEquity = seriesNum(row, "stockholdersEquity", "commonStockEquity") || cur.totalStockholdersEquity;
      cur.weightedAverageShsOutDil = seriesNum(row, "dilutedAverageShares") || cur.weightedAverageShsOutDil;
      cur.freeCashFlow = seriesNum(row, "freeCashFlow") || cur.freeCashFlow;
      byYear.set(year, cur);
    }

    const years = assembleYears([...byYear.values()], defaultTaxRate(ticker), warnings);
    if (years.length === 0) return null;

    const last = years.at(-1);
    const stats = summary.defaultKeyStatistics;
    const priceMod = summary.price;
    const built = buildQuote(
      ticker,
      {
        name: String(priceMod?.longName ?? priceMod?.shortName ?? quote.shortName ?? ticker),
        exchange: String(priceMod?.exchangeName ?? quote.fullExchangeName ?? ""),
        price: Number(quote.regularMarketPrice ?? 0),
        marketCap: Number(quote.marketCap ?? 0),
        pe: Number(quote.trailingPE ?? 0) || null,
        beta: Number(stats?.beta ?? 1),
        sharesOutstanding: Number(stats?.sharesOutstanding ?? last?.shares ?? 0),
        currency: String(quote.currency ?? "USD"),
        sector: "",
      },
      last,
    );
    return finalizeCompany("yahoo", ticker, built, years, warnings);
  } catch {
    return null;
  }
}
