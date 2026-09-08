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
  fiscalYear?: number | string;
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

/** Prefer a filled P&L field over a later 0/null from BS/CF of the same year. */
export function mergeRawYears(groups: Array<RawYear[] | null | undefined>): RawYear[] {
  const byYear = new Map<number, RawYear>();
  for (const rows of groups) {
    for (const row of rows ?? []) {
      const year = num(row.fiscalYear ?? row.calendarYear ?? row.year ?? (row.date ? new Date(row.date).getFullYear() : 0));
      if (year < 1990) continue;
      const cur = byYear.get(year) ?? { year, calendarYear: year };
      for (const [key, value] of Object.entries(row)) {
        if (value == null || value === "") continue;
        const existing = (cur as Record<string, unknown>)[key];
        if (typeof value === "number" && value === 0 && typeof existing === "number" && existing !== 0) {
          continue;
        }
        (cur as Record<string, unknown>)[key] = value;
      }
      cur.year = year;
      cur.calendarYear = year;
      byYear.set(year, cur);
    }
  }
  return [...byYear.values()];
}

export function assembleYears(raw: RawYear[], taxFallback: number, warnings: string[]): StatementYear[] {
  const sorted = [...raw]
    .map((r) => ({
      year: num(r.fiscalYear ?? r.calendarYear ?? r.year ?? (r.date ? new Date(r.date).getFullYear() : 0)),
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
    .filter((y) => y.year > 1990 && y.revenue > 0)
    .sort((a, b) => a.year - b.year);

  const consecutive: typeof sorted = [];
  for (const y of sorted) {
    const prev = consecutive.at(-1);
    if (prev && y.year !== prev.year + 1) consecutive.length = 0;
    consecutive.push(y);
  }
  const kept = (consecutive.length ? consecutive : sorted).slice(-5);

  if (kept.length < 3) {
    warnings.push("Fewer than 3 years of statements — projections use more defaults.");
  }

  return kept.map((y, i) => {
    const prev = kept[i - 1];
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

export function usableStatementYears(years: CompanyFinancials["years"]): CompanyFinancials["years"] {
  const complete = [...years]
    .filter((y) => y.year > 1990 && y.revenue > 0)
    .sort((a, b) => a.year - b.year);
  const run: typeof complete = [];
  for (const y of complete) {
    const prev = run.at(-1);
    if (prev && y.year !== prev.year + 1) run.length = 0;
    run.push(y);
  }
  return (run.length ? run : complete).slice(-5);
}

function preferNumber(primary: number, backup: number): number {
  return primary !== 0 && Number.isFinite(primary) ? primary : backup;
}

export function mergeCompanyBooks(
  primary: CompanyFinancials | null,
  backup: CompanyFinancials | null,
): CompanyFinancials | null {
  if (!primary) return backup;
  if (!backup) return primary;
  const byYear = new Map<number, StatementYear>();
  for (const year of backup.years) byYear.set(year.year, { ...year });
  for (const year of primary.years) {
    const other = byYear.get(year.year);
    if (!other) {
      byYear.set(year.year, { ...year });
      continue;
    }
    byYear.set(year.year, {
      ...other,
      ...year,
      revenue: preferNumber(year.revenue, other.revenue),
      grossProfit: preferNumber(year.grossProfit, other.grossProfit),
      ebit: preferNumber(year.ebit, other.ebit),
      ebitda: preferNumber(year.ebitda, other.ebitda),
      da: preferNumber(year.da, other.da),
      capex: preferNumber(year.capex, other.capex),
      nwc: preferNumber(year.nwc, other.nwc),
      deltaNwc: preferNumber(year.deltaNwc, other.deltaNwc),
      fcf: preferNumber(year.fcf, other.fcf),
      interestExpense: preferNumber(year.interestExpense, other.interestExpense),
      netIncome: preferNumber(year.netIncome, other.netIncome),
      totalDebt: preferNumber(year.totalDebt, other.totalDebt),
      cash: preferNumber(year.cash, other.cash),
      equity: preferNumber(year.equity, other.equity),
      shares: preferNumber(year.shares, other.shares),
      roic: year.roic ?? other.roic,
    });
  }
  const years = [...byYear.values()].sort((a, b) => a.year - b.year);
  const q = primary.quote;
  const b = backup.quote;
  const quote: Quote = {
    ...b,
    ...q,
    ticker: q.ticker,
    name: q.name || b.name,
    exchange: q.exchange || b.exchange,
    price: preferNumber(q.price, b.price),
    marketCap: preferNumber(q.marketCap, b.marketCap),
    enterpriseValue: preferNumber(q.enterpriseValue, b.enterpriseValue),
    pe: q.pe ?? b.pe,
    evEbitda: q.evEbitda ?? b.evEbitda,
    evRevenue: q.evRevenue ?? b.evRevenue,
    beta: preferNumber(q.beta, b.beta),
    sharesOutstanding: preferNumber(q.sharesOutstanding, b.sharesOutstanding),
    currency: q.currency || b.currency,
    sector: q.sector || b.sector,
  };
  const warnings = [...primary.warnings];
  if (backup.source === "fmp") warnings.push("Missing Yahoo statement fields were filled from Financial Modeling Prep.");
  const merged: CompanyFinancials = {
    quote,
    years,
    source: isUsableFinancials(primary) ? primary.source : backup.source,
    warnings: [...new Set(warnings)],
    defaults: primary.defaults,
  };
  return merged;
}

export function finalizeCompany(
  source: CompanyFinancials["source"],
  symbol: string,
  quote: Quote,
  years: StatementYear[],
  warnings: string[],
): CompanyFinancials {
  const kept = usableStatementYears(years);
  if (kept.length === 0) {
    warnings.push("No usable financial statements — engines will use conservative placeholders.");
  }
  return {
    quote,
    years: kept,
    source,
    warnings: [...new Set(warnings)],
    defaults: defaultRates(symbol),
  };
}
