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
  // Lazy import keeps Next edge/build from evaluating the SDK at module load.
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

type LooseRow = Record<string, unknown> & { endDate?: Date | string };

function n(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function pickYear(date: Date | string | undefined): number {
  if (!date) return 0;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getUTCFullYear();
}

export async function fetchYahooCompany(symbol: string): Promise<CompanyFinancials | null> {
  const ticker = normalizeSymbol(symbol);
  const warnings: string[] = ["Yahoo Finance fallback — some fields may be incomplete."];
  try {
    const yf = await client();
    const [quote, summary] = await Promise.all([
      yf.quote(ticker),
      yf.quoteSummary(ticker, {
        modules: [
          "price",
          "summaryDetail",
          "defaultKeyStatistics",
          "financialData",
          "incomeStatementHistory",
          "balanceSheetHistory",
          "cashflowStatementHistory",
        ],
      }),
    ]);

    const income = (summary.incomeStatementHistory?.incomeStatementHistory ?? []) as unknown as LooseRow[];
    const balances = (summary.balanceSheetHistory?.balanceSheetStatements ?? []) as unknown as LooseRow[];
    const cashflows = (summary.cashflowStatementHistory?.cashflowStatements ?? []) as unknown as LooseRow[];

    const byYear = new Map<number, RawYear>();
    for (const row of income) {
      const year = pickYear(row.endDate);
      byYear.set(year, {
        year,
        date: row.endDate ? new Date(row.endDate).toISOString().slice(0, 10) : undefined,
        revenue: n(row.totalRevenue),
        grossProfit: n(row.grossProfit),
        ebit: n(row.ebit ?? row.operatingIncome),
        ebitda: n(row.ebitda ?? row.ebit),
        incomeTaxExpense: n(row.incomeTaxExpense),
        incomeBeforeTax: n(row.incomeBeforeTax),
        interestExpense: n(row.interestExpense),
        netIncome: n(row.netIncome),
      });
    }
    for (const row of balances) {
      const year = pickYear(row.endDate);
      const cur = byYear.get(year) ?? { year };
      cur.totalDebt = n(row.longTermDebt) + n(row.shortLongTermDebt) + n(row.totalDebt);
      cur.cashAndCashEquivalents = n(row.cash ?? row.cashAndCashEquivalents);
      cur.totalStockholdersEquity = n(row.totalStockholderEquity ?? row.stockholdersEquity);
      byYear.set(year, cur);
    }
    for (const row of cashflows) {
      const year = pickYear(row.endDate);
      const cur = byYear.get(year) ?? { year };
      cur.depreciationAndAmortization = n(row.depreciation ?? row.depreciationAndAmortization);
      cur.capitalExpenditure = Math.abs(n(row.capitalExpenditures ?? row.capitalExpenditure));
      cur.changeInWorkingCapital = n(row.changeToNetincome ?? row.changeInWorkingCapital);
      cur.freeCashFlow =
        n(row.freeCashFlow) ||
        n(row.totalCashFromOperatingActivities) - Math.abs(n(row.capitalExpenditures));
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
