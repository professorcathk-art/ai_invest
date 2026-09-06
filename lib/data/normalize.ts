import type { CompanyFinancials, Quote, StatementYear } from "@/lib/engines/types";

export function isHkTicker(symbol: string): boolean {
  return symbol.toUpperCase().endsWith(".HK") || /^\d{4}\.HK$/i.test(symbol);
}

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\s+/g, "");
}

export function defaultTaxRate(symbol: string): number {
  return isHkTicker(symbol) ? 0.165 : 0.21;
}

export function defaultRates(symbol: string) {
  return {
    riskFreeRate: isHkTicker(symbol) ? 0.035 : 0.045,
    equityRiskPremium: isHkTicker(symbol) ? 0.055 : 0.05,
    costOfDebt: 0.065,
    taxRate: defaultTaxRate(symbol),
  };
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function opt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n !== 0 ? n : Number.isFinite(n) ? n : null;
}

export interface RawYear {
  year?: number;
  date?: string;
  calendarYear?: number | string;
  revenue?: number;
  grossProfit?: number;
  ebit?: number;
  operatingIncome?: number;
  ebitda?: number;
  depreciationAndAmortization?: number;
  capitalExpenditure?: number;
  changeInWorkingCapital?: number;
  incomeTaxExpense?: number;
  incomeBeforeTax?: number;
  interestExpense?: number;
  netIncome?: number;
  totalDebt?: number;
  cashAndCashEquivalents?: number;
  totalStockholdersEquity?: number;
  weightedAverageShsOutDil?: number;
  weightedAverageShsOut?: number;
  freeCashFlow?: number;
  roic?: number;
  netWorkingCapital?: number;
}

export function assembleYears(raw: RawYear[], taxFallback: number, warnings: string[]): StatementYear[] {
  const sorted = [...raw]
    .map((r) => ({
      year: num(r.calendarYear ?? r.year ?? (r.date ? new Date(r.date).getFullYear() : 0)),
      fiscalDate: r.date ?? `${r.calendarYear ?? r.year}-12-31`,
      revenue: num(r.revenue),
      grossProfit: num(r.grossProfit),
      ebit: num(r.ebit ?? r.operatingIncome),
      ebitda: num(r.ebitda),
      da: num(r.depreciationAndAmortization),
      capex: Math.abs(num(r.capitalExpenditure)),
      nwc: num(r.netWorkingCapital),
      deltaNwc: -num(r.changeInWorkingCapital),
      taxRate: (() => {
        const ebt = num(r.incomeBeforeTax);
        const tax = num(r.incomeTaxExpense);
        if (ebt > 0 && tax !== 0) return Math.min(0.4, Math.max(0, tax / ebt));
        return taxFallback;
      })(),
      interestExpense: Math.abs(num(r.interestExpense)),
      netIncome: num(r.netIncome),
      totalDebt: num(r.totalDebt),
      cash: num(r.cashAndCashEquivalents),
      equity: num(r.totalStockholdersEquity),
      shares: num(r.weightedAverageShsOutDil || r.weightedAverageShsOut),
      fcf: num(r.freeCashFlow),
      roic: opt(r.roic),
    }))
    .filter((y) => y.year > 1990 && (y.revenue > 0 || Math.abs(y.ebit) > 0 || Math.abs(y.netIncome) > 0))
    .sort((a, b) => a.year - b.year)
    .slice(-5);

  if (sorted.length < 3) {
    warnings.push("Fewer than 3 years of statements — projections use more defaults.");
  }

  return sorted.map((y, i) => {
    const prev = sorted[i - 1];
    const deltaNwc =
      y.deltaNwc !== 0 ? y.deltaNwc : prev && y.nwc && prev.nwc ? y.nwc - prev.nwc : 0;
    const ebitda = y.ebitda || y.ebit + y.da;
    const da = y.da || Math.max(ebitda - y.ebit, 0);
    const fcf =
      y.fcf ||
      y.ebit * (1 - y.taxRate) + da - y.capex - deltaNwc;
    if (!y.revenue) warnings.push(`Missing revenue for FY${y.year}; filled with 0.`);
    return {
      year: y.year,
      fiscalDate: y.fiscalDate,
      revenue: y.revenue,
      grossProfit: y.grossProfit,
      ebit: y.ebit,
      ebitda,
      da,
      capex: y.capex,
      nwc: y.nwc,
      deltaNwc,
      taxRate: y.taxRate,
      fcf,
      interestExpense: y.interestExpense,
      netIncome: y.netIncome,
      totalDebt: y.totalDebt,
      cash: y.cash,
      equity: y.equity,
      shares: y.shares,
      roic: y.roic,
    };
  });
}

export function reportingCurrency(symbol: string, raw?: string | null): string {
  const given = (raw ?? "").trim().toUpperCase();
  if (given && given !== "USD") return given;
  const ticker = normalizeSymbol(symbol);
  if (ticker.endsWith(".HK")) return "HKD";
  if (ticker.endsWith(".KS") || ticker.endsWith(".KQ")) return "KRW";
  if (ticker.endsWith(".T")) return "JPY";
  if (ticker.endsWith(".SS") || ticker.endsWith(".SZ")) return "CNY";
  if (ticker.endsWith(".L")) return "GBP";
  return given || "USD";
}

export function buildQuote(
  symbol: string,
  raw: Partial<Quote> & { companyName?: string; mktCap?: number },
  last: StatementYear | undefined,
): Quote {
  const price = num(raw.price);
  const shares = num(raw.sharesOutstanding ?? last?.shares, 1);
  const marketCap = num(raw.marketCap ?? raw.mktCap, price * shares);
  const netDebt = last ? last.totalDebt - last.cash : 0;
  const enterpriseValue = num(raw.enterpriseValue, marketCap + netDebt);
  return {
    ticker: normalizeSymbol(symbol),
    name: raw.name ?? raw.companyName ?? symbol,
    exchange: raw.exchange ?? "",
    price,
    marketCap,
    enterpriseValue,
    pe: raw.pe ?? null,
    evEbitda: raw.evEbitda ?? (last && last.ebitda ? enterpriseValue / last.ebitda : null),
    evRevenue: raw.evRevenue ?? (last && last.revenue ? enterpriseValue / last.revenue : null),
    beta: num(raw.beta, 1),
    sharesOutstanding: shares,
    currency: reportingCurrency(symbol, raw.currency),
    sector: raw.sector ?? "",
  };
}

export function isUsableFinancials(financials: CompanyFinancials): boolean {
  const complete = financials.years.filter(
    (y) => y.revenue > 0 && (Math.abs(y.ebit) > 0 || Math.abs(y.ebitda) > 0 || Math.abs(y.fcf) > 0),
  );
  return complete.length >= 3;
}

/** Books + a computed DCF. Floored-at-zero prices still count as a real result. */
export function isUsableValuation(
  financials: CompanyFinancials,
  dcf: { impliedPriceGordon: number; marketPrice: number; enterpriseValueGordon: number },
): boolean {
  if (!isUsableFinancials(financials)) return false;
  return dcf.marketPrice > 0 && Number.isFinite(dcf.impliedPriceGordon);
}

export function finalizeCompany(
  source: CompanyFinancials["source"],
  symbol: string,
  quote: Quote,
  years: StatementYear[],
  warnings: string[],
): CompanyFinancials {
  if (years.length === 0) {
    warnings.push("No usable financial statements — engines will use conservative placeholders.");
  }
  return {
    quote,
    years,
    source,
    warnings: [...new Set(warnings)],
    defaults: defaultRates(symbol),
  };
}
