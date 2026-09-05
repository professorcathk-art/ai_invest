import type { CompanyFinancials, VcResult } from "./types";
import { cagr, latest, safeDiv, yoy } from "./math";

export function runVc(financials: CompanyFinancials): VcResult {
  const { years, quote } = financials;
  const last = latest(years);
  const prior = years.length >= 2 ? years[years.length - 2] : undefined;
  const threeAgo = years.length >= 4 ? years[years.length - 4] : years[0];

  const yoyGrowth = prior ? yoy(prior.revenue, last.revenue) : null;
  const cagr3y =
    threeAgo && years.length >= 4 ? cagr(threeAgo.revenue, last.revenue, 3) : null;
  const fcfMargin = safeDiv(last.fcf, last.revenue);
  const ruleOf40 =
    yoyGrowth != null && fcfMargin != null ? yoyGrowth * 100 + fcfMargin * 100 : null;
  const fcfConversion = safeDiv(last.fcf, last.ebitda);
  const evRevenue = quote.evRevenue ?? safeDiv(quote.enterpriseValue, last.revenue);
  const netBurn = last.fcf < 0 ? Math.abs(last.fcf) : 0;
  const capitalEfficiency =
    last.fcf > 0 ? safeDiv(last.fcf, last.revenue) : netBurn > 0 ? safeDiv(last.fcf, -netBurn) : null;
  const ebitdaMargin = safeDiv(last.ebitda, last.revenue);
  const grossMargin = safeDiv(last.grossProfit, last.revenue);
  const netDebtToEbitda = safeDiv(last.totalDebt - last.cash, last.ebitda);
  const debtToEquity = safeDiv(last.totalDebt, last.equity);

  const fcfSigns = years.map((y) => y.fcf > 0);
  const positiveFcfYears = fcfSigns.filter(Boolean).length;

  return {
    yoyGrowth,
    cagr3y,
    fcfMargin,
    ruleOf40,
    fcfConversion,
    evRevenue,
    capitalEfficiency,
    ebitdaMargin,
    grossMargin,
    roic: last.roic,
    netDebtToEbitda,
    debtToEquity,
    positiveFcfYears,
    consecutivePositiveFcf: fcfSigns.length >= 5 && fcfSigns.every(Boolean),
  };
}
