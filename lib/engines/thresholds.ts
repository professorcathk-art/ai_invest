import type {
  DcfResult,
  LboResult,
  PersonaScorecard,
  ThresholdCheck,
  VcResult,
  Vote,
} from "./types";

function scoreFromChecks(checks: ThresholdCheck[]): number {
  const known = checks.filter((c) => c.passed !== null);
  if (known.length === 0) return 0;
  const hits = known.filter((c) => c.passed).length;
  return Math.round((hits / known.length) * 100);
}

function voteFromScore(score: number): Vote {
  if (score >= 75) return "strong_invest";
  if (score >= 45) return "conditional_invest";
  return "pass";
}

function num(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value;
}

export function evaluatePersonas(vc: VcResult, lbo: LboResult, dcf: DcfResult): PersonaScorecard[] {
  const buffettChecks: ThresholdCheck[] = [
    {
      id: "roic",
      label: "ROIC > 15%",
      actual: num(vc.roic),
      target: "> 15%",
      passed: vc.roic == null ? null : vc.roic > 0.15,
      format: "pct",
    },
    {
      id: "fcf5",
      label: "Positive FCF (5 yrs)",
      actual: vc.positiveFcfYears,
      target: "5 / 5 years",
      passed: vc.consecutivePositiveFcf,
      format: "years",
    },
    {
      id: "de",
      label: "Low Debt / Equity",
      actual: num(vc.debtToEquity),
      target: "< 1.0x",
      passed: vc.debtToEquity == null ? null : vc.debtToEquity < 1,
      format: "multiple",
    },
    {
      id: "mos",
      label: "Margin of safety (DCF)",
      actual: dcf.impliedPriceGordon > 0 && dcf.marketPrice > 0 ? num(dcf.upsideGordon) : null,
      target: "> 20% upside",
      passed:
        dcf.impliedPriceGordon > 0 && dcf.marketPrice > 0 ? dcf.upsideGordon > 0.2 : null,
      format: "pct",
    },
  ];

  const thielChecks: ThresholdCheck[] = [
    {
      id: "yoy",
      label: "YoY revenue growth > 40%",
      actual: num(vc.yoyGrowth),
      target: "> 40%",
      passed: vc.yoyGrowth == null ? null : vc.yoyGrowth > 0.4,
      format: "pct",
    },
    {
      id: "gm",
      label: "Gross margin > 70%",
      actual: num(vc.grossMargin),
      target: "> 70%",
      passed: vc.grossMargin == null ? null : vc.grossMargin > 0.7,
      format: "pct",
    },
    {
      id: "rule40",
      label: "Rule of 40",
      actual: num(vc.ruleOf40),
      target: "> 40",
      passed: vc.ruleOf40 == null ? null : vc.ruleOf40 > 40,
      format: "number",
    },
  ];

  const peChecks: ThresholdCheck[] = [
    {
      id: "ebitda",
      label: "EBITDA margin > 20%",
      actual: num(vc.ebitdaMargin),
      target: "> 20%",
      passed: vc.ebitdaMargin == null ? null : vc.ebitdaMargin > 0.2,
      format: "pct",
    },
    {
      id: "conv",
      label: "FCF conversion > 60%",
      actual: num(vc.fcfConversion),
      target: "> 60%",
      passed: vc.fcfConversion == null ? null : vc.fcfConversion > 0.6,
      format: "pct",
    },
    {
      id: "irr",
      label: "Base IRR > 20%",
      actual: Number.isFinite(lbo.base.irr) && lbo.base.irr > -0.99 ? lbo.base.irr : null,
      target: "> 20%",
      passed: Number.isFinite(lbo.base.irr) && lbo.base.irr > -0.99 ? lbo.base.irr > 0.2 : null,
      format: "pct",
    },
    {
      id: "moic",
      label: "Base MoIC > 2.5x",
      actual: Number.isFinite(lbo.base.moic) && lbo.base.moic > 0 ? lbo.base.moic : null,
      target: "> 2.5x",
      passed: Number.isFinite(lbo.base.moic) && lbo.base.moic > 0 ? lbo.base.moic > 2.5 : null,
      format: "multiple",
    },
  ];

  const dalioChecks: ThresholdCheck[] = [
    {
      id: "nd",
      label: "Net Debt / EBITDA",
      actual: num(vc.netDebtToEbitda),
      target: "< 2.0x",
      passed: vc.netDebtToEbitda == null ? null : vc.netDebtToEbitda < 2,
      format: "multiple",
    },
    {
      id: "cash",
      label: "FCF margin",
      actual: num(vc.fcfMargin),
      target: "> 5%",
      passed: vc.fcfMargin == null ? null : vc.fcfMargin > 0.05,
      format: "pct",
    },
    {
      id: "de2",
      label: "Balance sheet (D/E)",
      actual: num(vc.debtToEquity),
      target: "< 1.5x",
      passed: vc.debtToEquity == null ? null : vc.debtToEquity < 1.5,
      format: "multiple",
    },
  ];

  const make = (
    id: PersonaScorecard["id"],
    name: string,
    assetClass: string,
    checks: ThresholdCheck[],
  ): PersonaScorecard => {
    const score = scoreFromChecks(checks);
    return { id, name, assetClass, checks, score, vote: voteFromScore(score) };
  };

  return [
    make("buffett", "Warren Buffett", "Value / Quality Compounder", buffettChecks),
    make("thiel", "Peter Thiel", "Deep Tech / Early VC", thielChecks),
    make("pe", "PE Partner (KKR / BX)", "LBO / Buyout", peChecks),
    make("dalio", "Ray Dalio", "Macro / Risk Parity", dalioChecks),
  ];
}
