import { describe, expect, it } from "vitest";
import type { CompanyFinancials, SliderAssumptions } from "../types";
import { ufcf } from "../math";
import { runDcf } from "../dcf";
import { runLbo } from "../lbo";
import { runVc } from "../vc";
import { runEngines } from "../index";
import { fallbackAnalysis } from "@/lib/llm/personas";
import { icAnalysisSchema } from "@/lib/llm/schemas";

function fixture(): CompanyFinancials {
  const years = [2020, 2021, 2022, 2023, 2024].map((year, i) => {
    const revenue = 80_000_000 + i * 10_000_000;
    const ebit = revenue * 0.25;
    const da = revenue * 0.05;
    const capex = revenue * 0.06;
    const nwc = revenue * 0.1;
    const prevNwc = i === 0 ? nwc : (80_000_000 + (i - 1) * 10_000_000) * 0.1;
    const deltaNwc = nwc - prevNwc;
    const taxRate = 0.21;
    const fcf = ufcf({ ebit, taxRate, da, capex, deltaNwc });
    return {
      year,
      fiscalDate: `${year}-09-30`,
      revenue,
      grossProfit: revenue * 0.45,
      ebit,
      ebitda: ebit + da,
      da,
      capex,
      nwc,
      deltaNwc,
      taxRate,
      fcf,
      interestExpense: 2_000_000,
      netIncome: ebit * (1 - taxRate),
      totalDebt: 40_000_000,
      cash: 15_000_000,
      equity: 90_000_000,
      shares: 10_000_000,
      roic: 0.18,
    };
  });

  return {
    quote: {
      ticker: "TEST",
      name: "Test Corp",
      exchange: "NASDAQ",
      price: 50,
      marketCap: 500_000_000,
      enterpriseValue: 525_000_000,
      pe: 18,
      evEbitda: 14,
      evRevenue: 4.4,
      beta: 1.1,
      sharesOutstanding: 10_000_000,
      currency: "USD",
      sector: "Software",
    },
    years,
    source: "fixture",
    warnings: [],
    defaults: {
      riskFreeRate: 0.045,
      equityRiskPremium: 0.05,
      costOfDebt: 0.065,
      taxRate: 0.21,
    },
  };
}

const sliders: SliderAssumptions = {
  wacc: 0.09,
  terminalGrowth: 0.025,
  exitMultiple: 12,
  debtPct: 0.5,
};

describe("UFCF", () => {
  it("matches the PRD identity", () => {
    expect(ufcf({ ebit: 30, taxRate: 0.21, da: 7, capex: 8, deltaNwc: 2 })).toBeCloseTo(
      30 * 0.79 + 7 - 8 - 2,
      8,
    );
  });
});

describe("DCF", () => {
  it("produces a 5x5 sensitivity and positive EV at 9% WACC", () => {
    const dcf = runDcf(fixture(), sliders);
    expect(dcf.projectedUfcf).toHaveLength(5);
    expect(dcf.sensitivityWaccGrowth).toHaveLength(5);
    expect(dcf.sensitivityWaccGrowth[0]).toHaveLength(5);
    expect(dcf.enterpriseValueGordon).toBeGreaterThan(0);
    expect(dcf.impliedPriceGordon).toBeGreaterThan(0);
  });

  it("raises implied price when WACC falls", () => {
    const high = runDcf(fixture(), { ...sliders, wacc: 0.12 });
    const low = runDcf(fixture(), { ...sliders, wacc: 0.07 });
    expect(low.impliedPriceGordon).toBeGreaterThan(high.impliedPriceGordon);
  });

  it("floors cash-burning equity value at zero instead of a negative share price", () => {
    const loss = fixture();
    loss.years = loss.years.map((y) => ({
      ...y,
      ebit: -Math.abs(y.revenue) * 0.2,
      ebitda: -Math.abs(y.revenue) * 0.1,
      fcf: -Math.abs(y.revenue) * 0.15,
      totalDebt: 5_000_000_000,
      cash: 1,
    }));
    const dcf = runDcf(loss, sliders);
    expect(dcf.impliedPriceGordon).toBe(0);
    expect(dcf.impliedPriceExit).toBe(0);
    expect(dcf.sensitivityWaccGrowth.flat().every((p) => p >= 0)).toBe(true);
    const lbo = runLbo(loss, sliders);
    expect(lbo.base.irr).toBeGreaterThanOrEqual(0);
    expect(lbo.base.moic).toBeGreaterThanOrEqual(0);
    expect(lbo.bear.irr).toBeGreaterThanOrEqual(0);
  });
});

describe("LBO", () => {
  it("uses MoIC^(1/5)-1 for IRR and 50/50 structure", () => {
    const lbo = runLbo(fixture(), sliders);
    expect(lbo.entryDebt).toBeCloseTo(lbo.entryEv * 0.5, 4);
    expect(lbo.entryEquity).toBeCloseTo(lbo.entryEv * 0.5, 4);
    expect(lbo.base.irr).toBeCloseTo(lbo.base.moic ** 0.2 - 1, 8);
    expect(lbo.bull.exitEquity).toBeGreaterThan(lbo.base.exitEquity);
    expect(lbo.bear.exitEquity).toBeLessThan(lbo.base.exitEquity);
    expect(lbo.base.years).toHaveLength(5);
    const y1 = lbo.base.years[0]!;
    expect(y1.interest).toBeCloseTo(y1.openingDebt * 0.065, 6);
    expect(y1.principal).toBeCloseTo(y1.openingDebt * 0.05, 6);
  });
});

describe("VC", () => {
  it("computes Rule of 40 from growth + FCF margin", () => {
    const vc = runVc(fixture());
    expect(vc.yoyGrowth).toBeCloseTo(10_000_000 / 110_000_000, 6);
    expect(vc.fcfMargin).not.toBeNull();
    expect(vc.ruleOf40).toBeCloseTo(vc.yoyGrowth! * 100 + vc.fcfMargin! * 100, 6);
    expect(vc.consecutivePositiveFcf).toBe(true);
    expect(vc.roic).toBeCloseTo(0.18, 6);
  });
});

describe("bundle", () => {
  it("keeps LLM-free scorecards deterministic", () => {
    const bundle = runEngines(fixture(), sliders);
    expect(bundle.personas).toHaveLength(4);
    expect(bundle.personas.every((p) => p.score >= 0 && p.score <= 100)).toBe(true);
  });

  it("builds a detailed IC memo that matches the persona schema", () => {
    const bundle = runEngines(fixture(), sliders);
    const analysis = fallbackAnalysis(bundle);
    const parsed = icAnalysisSchema.parse(analysis);
    expect(parsed.narratives).toHaveLength(4);
    expect(parsed.debate).toHaveLength(4);
    expect(parsed.narratives.every((n) => n.argument.length > 200)).toBe(true);
  });
});
