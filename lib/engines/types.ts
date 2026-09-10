export interface StatementYear {
  year: number;
  fiscalDate: string;
  revenue: number;
  grossProfit: number;
  ebit: number;
  ebitda: number;
  da: number;
  capex: number;
  nwc: number;
  deltaNwc: number;
  taxRate: number;
  fcf: number;
  interestExpense: number;
  netIncome: number;
  totalDebt: number;
  cash: number;
  equity: number;
  shares: number;
  roic: number | null;
}

export interface Quote {
  ticker: string;
  name: string;
  exchange: string;
  price: number;
  marketCap: number;
  enterpriseValue: number;
  pe: number | null;
  evEbitda: number | null;
  evRevenue: number | null;
  beta: number;
  sharesOutstanding: number;
  currency: string;
  sector: string;
}

export interface CompanyFinancials {
  quote: Quote;
  years: StatementYear[];
  source: "fmp" | "yahoo" | "fixture";
  warnings: string[];
  defaults: {
    riskFreeRate: number;
    equityRiskPremium: number;
    costOfDebt: number;
    taxRate: number;
  };
}

export interface SliderAssumptions {
  wacc: number;
  terminalGrowth: number;
  exitMultiple: number;
  debtPct: number;
}

export const SLIDER_BOUNDS = {
  wacc: { min: 0.04, max: 0.15, step: 0.001 },
  terminalGrowth: { min: 0.01, max: 0.05, step: 0.001 },
  exitMultiple: { min: 4, max: 20, step: 0.1 },
  debtPct: { min: 0.2, max: 0.8, step: 0.01 },
} as const;

export interface DcfResult {
  historicalUfcf: number[];
  projectedUfcf: number[];
  projectedEbitda: number[];
  projectedRevenue: number[];
  lastHistoricalRevenue: number;
  growthRates: number[];
  ebitMargin: number;
  daPct: number;
  capexPct: number;
  nwcPct: number;
  wacc: number;
  computedWacc: number;
  terminalValueGordon: number;
  terminalValueExit: number;
  pvExplicitGordon: number;
  pvTerminalGordon: number;
  pvExplicitExit: number;
  pvTerminalExit: number;
  enterpriseValueGordon: number;
  enterpriseValueExit: number;
  netDebt: number;
  equityValueGordon: number;
  equityValueExit: number;
  impliedPriceGordon: number;
  impliedPriceExit: number;
  marketPrice: number;
  upsideGordon: number;
  upsideExit: number;
  sensitivityWaccGrowth: number[][];
  sensitivityWaccExit: number[][];
  waccAxis: number[];
  growthAxis: number[];
  exitAxis: number[];
}

export interface LboYear {
  year: number;
  ebitda: number;
  openingDebt: number;
  interest: number;
  principal: number;
  endingDebt: number;
}

export interface LboScenario {
  name: "base" | "bull" | "bear";
  label: string;
  entryEquity: number;
  exitEv: number;
  exitEquity: number;
  endingDebt: number;
  moic: number;
  irr: number;
  years: LboYear[];
}

export interface LboResult {
  entryEv: number;
  entryEbitda: number;
  entryMultiple: number;
  entryDebt: number;
  entryEquity: number;
  interestRate: number;
  paydownRate: number;
  exitMultiple: number;
  base: LboScenario;
  bull: LboScenario;
  bear: LboScenario;
}

export interface VcResult {
  yoyGrowth: number | null;
  cagr3y: number | null;
  fcfMargin: number | null;
  ruleOf40: number | null;
  fcfConversion: number | null;
  evRevenue: number | null;
  capitalEfficiency: number | null;
  ebitdaMargin: number | null;
  grossMargin: number | null;
  roic: number | null;
  netDebtToEbitda: number | null;
  debtToEquity: number | null;
  positiveFcfYears: number;
  consecutivePositiveFcf: boolean;
}

export type Vote = "strong_invest" | "conditional_invest" | "pass";

export interface ThresholdCheck {
  id: string;
  label: string;
  actual: number | boolean | null;
  target: string;
  passed: boolean | null;
  format?: "pct" | "multiple" | "number" | "years";
}

export type PersonaId = "buffett" | "thiel" | "pe" | "dalio" | "expert" | "trump" | "musk";

export interface PersonaScorecard {
  id: PersonaId;
  name: string;
  assetClass: string;
  checks: ThresholdCheck[];
  score: number;
  vote: Vote;
}

export interface EngineBundle {
  financials: CompanyFinancials;
  sliders: SliderAssumptions;
  dcf: DcfResult;
  lbo: LboResult;
  vc: VcResult;
  personas: PersonaScorecard[];
}
