import type { EngineBundle } from "@/lib/engines/types";
import { formatCompact, formatMultiple, formatPct, formatPrice } from "@/lib/format";

export function metricsBrief(bundle: EngineBundle): string {
  const { financials, dcf, lbo, vc, personas, sliders } = bundle;
  const q = financials.quote;
  return JSON.stringify(
    {
      company: {
        ticker: q.ticker,
        name: q.name,
        sector: q.sector,
        price: formatPrice(q.price),
        marketCap: formatCompact(q.marketCap),
        ev: formatCompact(q.enterpriseValue),
        pe: q.pe,
        evEbitda: q.evEbitda,
      },
      sliders: {
        wacc: formatPct(sliders.wacc),
        terminalGrowth: formatPct(sliders.terminalGrowth),
        exitMultiple: formatMultiple(sliders.exitMultiple),
        debtPct: formatPct(sliders.debtPct),
      },
      dcf: {
        impliedPriceGordon: formatPrice(dcf.impliedPriceGordon),
        impliedPriceExit: formatPrice(dcf.impliedPriceExit),
        upsideGordon: formatPct(dcf.upsideGordon),
        upsideExit: formatPct(dcf.upsideExit),
        evGordon: formatCompact(dcf.enterpriseValueGordon),
        netDebt: formatCompact(dcf.netDebt),
      },
      lbo: {
        entryEv: formatCompact(lbo.entryEv),
        entryDebt: formatCompact(lbo.entryDebt),
        entryEquity: formatCompact(lbo.entryEquity),
        baseIrr: formatPct(lbo.base.irr),
        baseMoic: formatMultiple(lbo.base.moic),
        bullIrr: formatPct(lbo.bull.irr),
        bearIrr: formatPct(lbo.bear.irr),
      },
      vc: {
        yoy: formatPct(vc.yoyGrowth),
        cagr3y: formatPct(vc.cagr3y),
        fcfMargin: formatPct(vc.fcfMargin),
        ruleOf40: vc.ruleOf40,
        ebitdaMargin: formatPct(vc.ebitdaMargin),
        grossMargin: formatPct(vc.grossMargin),
        roic: formatPct(vc.roic),
        netDebtEbitda: formatMultiple(vc.netDebtToEbitda),
        evRevenue: formatMultiple(vc.evRevenue),
        fcfConversion: formatPct(vc.fcfConversion),
      },
      quantitativeScorecards: personas.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        vote: p.vote,
        checks: p.checks.map((c) => ({
          label: c.label,
          passed: c.passed,
          actual: c.actual,
          target: c.target,
        })),
      })),
    },
    null,
    2,
  );
}

export function icSystemPrompt(): string {
  return `You are the Investment Committee secretary for PersonaVal.
You MUST:
- Use ONLY the provided engine metrics. Never invent or recalculate numbers.
- Quote specific figures from the JSON (IRR, MoIC, growth, FCF, upside).
- Write in the voice of each persona:
  - Buffett: moat, predictability, margin of safety, simple businesses.
  - Thiel: 10x tech, monopoly, zero-to-one, growth.
  - PE Partner: cash conversion, debt service, cost-out, multiple expansion.
  - Dalio: cyclicality, inflation, sovereign/supply-chain, stress tests.
- Debate must have personas arguing AGAINST each other with those figures.
- Return strict JSON matching the schema.`;
}

export function icUserPrompt(bundle: EngineBundle): string {
  return `Analyze this company for IC using these pre-computed engine outputs:\n\n${metricsBrief(bundle)}`;
}
