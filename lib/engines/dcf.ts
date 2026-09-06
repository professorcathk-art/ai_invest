import type { CompanyFinancials, DcfResult, SliderAssumptions } from "./types";
import { clamp, floorNonNeg, latest, linspace, npv, round, ufcf as calcUfcf, yoy } from "./math";
import { computeWacc } from "./wacc";

const FORECAST_YEARS = 5;

function projectGrowth(financials: CompanyFinancials, terminalGrowth: number): number[] {
  const revs = financials.years.map((y) => y.revenue).filter((r) => r > 0);
  const last = revs.at(-1) ?? 0;
  const first = revs[0] ?? last;
  const hist =
    revs.length >= 2 ? clamp((last / first) ** (1 / (revs.length - 1)) - 1, -0.2, 0.4) : 0.08;
  return Array.from({ length: FORECAST_YEARS }, (_, i) => {
    const t = (i + 1) / FORECAST_YEARS;
    return hist * (1 - t) + terminalGrowth * t;
  });
}

export function runDcf(financials: CompanyFinancials, sliders: SliderAssumptions): DcfResult {
  const last = latest(financials.years);
  const computedWacc = computeWacc(financials);
  const wacc = sliders.wacc;
  const g = sliders.terminalGrowth;
  const exitMult = sliders.exitMultiple;
  const tax = financials.defaults.taxRate;

  const historicalUfcf = financials.years.map((y) =>
    calcUfcf({
      ebit: y.ebit,
      taxRate: y.taxRate || tax,
      da: y.da,
      capex: y.capex,
      deltaNwc: y.deltaNwc,
    }),
  );

  const growths = projectGrowth(financials, g);
  const ebitMargin = last.revenue > 0 ? last.ebit / last.revenue : 0.15;
  const daPct = last.revenue > 0 ? last.da / last.revenue : 0.04;
  const capexPct = last.revenue > 0 ? last.capex / last.revenue : 0.05;
  const nwcPct = last.revenue > 0 ? last.nwc / last.revenue : 0.05;

  const projectedRevenue: number[] = [];
  const projectedEbitda: number[] = [];
  const projectedUfcf: number[] = [];
  let rev = last.revenue;

  for (const growth of growths) {
    const prevRev = rev;
    rev = rev * (1 + growth);
    const ebit = rev * ebitMargin;
    const da = rev * daPct;
    const ebitda = ebit + da;
    const capex = rev * capexPct;
    const nwc = rev * nwcPct;
    const prevNwc = prevRev * nwcPct;
    const deltaNwc = nwc - prevNwc;
    projectedRevenue.push(rev);
    projectedEbitda.push(ebitda);
    projectedUfcf.push(calcUfcf({ ebit, taxRate: tax, da, capex, deltaNwc }));
  }

  const lastUfcf = projectedUfcf.at(-1) ?? 0;
  const lastEbitda = projectedEbitda.at(-1) ?? 0;
  const terminalValueGordon = wacc > g ? (lastUfcf * (1 + g)) / (wacc - g) : lastUfcf * 20;
  const terminalValueExit = lastEbitda * exitMult;

  const pvExplicitGordon = npv(wacc, projectedUfcf);
  const pvTerminalGordon = terminalValueGordon / (1 + wacc) ** FORECAST_YEARS;
  const pvExplicitExit = npv(wacc, projectedUfcf);
  const pvTerminalExit = terminalValueExit / (1 + wacc) ** FORECAST_YEARS;

  const enterpriseValueGordon = pvExplicitGordon + pvTerminalGordon;
  const enterpriseValueExit = pvExplicitExit + pvTerminalExit;
  const netDebt = last.totalDebt - last.cash;
  const shares = Math.max(financials.quote.sharesOutstanding || last.shares, 1);

  const equityValueGordon = enterpriseValueGordon - netDebt;
  const equityValueExit = enterpriseValueExit - netDebt;
  const impliedPriceGordon = floorNonNeg(equityValueGordon / shares);
  const impliedPriceExit = floorNonNeg(equityValueExit / shares);
  const marketPrice = financials.quote.price;
  const upsideGordon = marketPrice > 0 ? impliedPriceGordon / marketPrice - 1 : 0;
  const upsideExit = marketPrice > 0 ? impliedPriceExit / marketPrice - 1 : 0;

  const waccAxis = uniqueAxis(linspace(wacc, [-0.02, -0.01, 0, 0.01, 0.02], 0.04, 0.15));
  const growthAxis = uniqueAxis(linspace(g, [-0.01, -0.005, 0, 0.005, 0.01], 0.01, 0.05));
  const exitAxis = uniqueAxis(linspace(exitMult, [-2, -1, 0, 1, 2], 4, 20));

  const priceAt = (w: number, tv: number) => {
    const ev = npv(w, projectedUfcf) + tv / (1 + w) ** FORECAST_YEARS;
    return floorNonNeg((ev - netDebt) / shares);
  };

  const sensitivityWaccGrowth = waccAxis.map((w) =>
    growthAxis.map((gg) => {
      const lu = projectedUfcf.at(-1) ?? 0;
      const tv = w > gg ? (lu * (1 + gg)) / (w - gg) : lu * 20;
      return round(priceAt(w, tv), 4);
    }),
  );

  const sensitivityWaccExit = waccAxis.map((w) =>
    exitAxis.map((em) => round(priceAt(w, lastEbitda * em), 4)),
  );

  return {
    historicalUfcf,
    projectedUfcf,
    projectedEbitda,
    projectedRevenue,
    wacc,
    computedWacc,
    terminalValueGordon,
    terminalValueExit,
    pvExplicitGordon,
    pvTerminalGordon,
    pvExplicitExit,
    pvTerminalExit,
    enterpriseValueGordon,
    enterpriseValueExit,
    netDebt,
    equityValueGordon,
    equityValueExit,
    impliedPriceGordon,
    impliedPriceExit,
    marketPrice,
    upsideGordon,
    upsideExit,
    sensitivityWaccGrowth,
    sensitivityWaccExit,
    waccAxis,
    growthAxis,
    exitAxis,
  };
}

function uniqueAxis(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  while (out.length < 5) {
    const last = out.at(-1) ?? 0;
    const next = round(last + 0.001, 6);
    if (!seen.has(next)) {
      seen.add(next);
      out.push(next);
    } else break;
  }
  return out.slice(0, 5);
}

export function fadeGrowthUsed(financials: CompanyFinancials): number | null {
  const revs = financials.years.map((y) => y.revenue);
  if (revs.length < 2) return null;
  return yoy(revs[0]!, revs.at(-1)!);
}
