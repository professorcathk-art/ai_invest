import type { CompanyFinancials } from "./types";
import { clamp, latest, safeDiv } from "./math";

export function computeWacc(financials: CompanyFinancials): number {
  const { quote, years, defaults } = financials;
  const last = latest(years);
  const equity = Math.max(quote.marketCap, 1);
  const netDebt = Math.max(last.totalDebt - last.cash, 0);
  const total = equity + netDebt;
  const ke = defaults.riskFreeRate + quote.beta * defaults.equityRiskPremium;
  const kd = defaults.costOfDebt * (1 - defaults.taxRate);
  const we = safeDiv(equity, total) ?? 1;
  const wd = 1 - we;
  return clamp(we * ke + wd * kd, 0.04, 0.15);
}

export function defaultSliders(financials: CompanyFinancials): {
  wacc: number;
  terminalGrowth: number;
  exitMultiple: number;
  debtPct: number;
} {
  const last = latest(financials.years);
  const exitMultiple = clamp(financials.quote.evEbitda ?? 12, 4, 20);
  const leverage = last.ebitda > 0 ? last.totalDebt / last.ebitda : 0;
  const debtPct = clamp(leverage > 0 ? Math.min(0.5, leverage / (leverage + 1)) : 0.5, 0.2, 0.8);
  return {
    wacc: computeWacc(financials),
    terminalGrowth: financials.quote.ticker.endsWith(".HK") ? 0.025 : 0.025,
    exitMultiple,
    debtPct,
  };
}
