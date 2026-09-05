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
  if (known.length === 0) return 50;
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
    },
    {
      id: "fcf5",
      label: "Positive FCF (5 yrs)",
      actual: vc.consecutivePositiveFcf,
      target: "5 / 5 years",
      passed: vc.consecutivePositiveFcf,
    },
    {
      id: "de",
      label: "Low Debt / Equity",
      actual: num(vc.debtToEquity),
      target: "< 1.0x",
      passed: vc.debtToEquity == null ? null : vc.debtToEquity < 1,
    },
    {
      id: "mos",
      label: "Margin of safety (DCF)",
      actual: num(dcf.upsideGordon),
      target: "> 20% upside",
      passed: dcf.upsideGordon > 0.2,
    },
  ];

  const thielChecks: ThresholdCheck[] = [
    {
      id: "yoy",
      label: "YoY revenue growth > 40%",
      actual: num(vc.yoyGrowth),
      target: "> 40%",
      passed: vc.yoyGrowth == null ? null : vc.yoyGrowth > 0.4,
    },
    {
      id: "gm",
      label: "Gross margin > 70%",
      actual: num(vc.grossMargin),
      target: "> 70%",
      passed: vc.grossMargin == null ? null : vc.grossMargin > 0.7,
    },
    {
      id: "rule40",
      label: "Rule of 40",
      actual: num(vc.ruleOf40),
      target: "> 40",
      passed: vc.ruleOf40 == null ? null : vc.ruleOf40 > 40,
    },
  ];

  const peChecks: ThresholdCheck[] = [
    {
      id: "ebitda",
      label: "EBITDA margin > 20%",
      actual: num(vc.ebitdaMargin),
      target: "> 20%",
      passed: vc.ebitdaMargin == null ? null : vc.ebitdaMargin > 0.2,
    },
    {
      id: "conv",
      label: "FCF conversion > 60%",
      actual: num(vc.fcfConversion),
      target: "> 60%",
      passed: vc.fcfConversion == null ? null : vc.fcfConversion > 0.6,
    },
    {
      id: "irr",
      label: "Base IRR > 20%",
      actual: lbo.base.irr,
      target: "> 20%",
      passed: lbo.base.irr > 0.2,
    },
    {
      id: "moic",
      label: "Base MoIC > 2.5x",
      actual: lbo.base.moic,
      target: "> 2.5x",
      passed: lbo.base.moic > 2.5,
    },
  ];

  const dalioChecks: ThresholdCheck[] = [
    {
      id: "nd",
      label: "Net Debt / EBITDA",
      actual: num(vc.netDebtToEbitda),
      target: "< 2.0x",
      passed: vc.netDebtToEbitda == null ? null : vc.netDebtToEbitda < 2,
    },
    {
      id: "cash",
      label: "FCF margin",
      actual: num(vc.fcfMargin),
      target: "> 5%",
      passed: vc.fcfMargin == null ? null : vc.fcfMargin > 0.05,
    },
    {
      id: "de2",
      label: "Balance sheet (D/E)",
      actual: num(vc.debtToEquity),
      target: "< 1.5x",
      passed: vc.debtToEquity == null ? null : vc.debtToEquity < 1.5,
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
