import type { EngineBundle } from "@/lib/engines/types";
import { formatMoney, formatMoneyCompact, formatMultiple, formatPct } from "@/lib/format";

export function metricsBrief(bundle: EngineBundle): string {
  const { financials, dcf, lbo, vc, personas, sliders } = bundle;
  const q = financials.quote;
  const ccy = q.currency || "USD";
  return JSON.stringify(
    {
      company: {
        ticker: q.ticker,
        name: q.name,
        sector: q.sector,
        reportingCurrency: ccy,
        listing: q.ticker.endsWith(".HK") ? "Hong Kong (prices and DCF in HKD, not USD)" : q.exchange,
        price: formatMoney(q.price, ccy),
        marketCap: formatMoneyCompact(q.marketCap, ccy),
        ev: formatMoneyCompact(q.enterpriseValue, ccy),
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
        currency: ccy,
        impliedPriceGordon: formatMoney(dcf.impliedPriceGordon, ccy),
        impliedPriceExit: formatMoney(dcf.impliedPriceExit, ccy),
        upsideGordon: formatPct(dcf.upsideGordon),
        upsideExit: formatPct(dcf.upsideExit),
        evGordon: formatMoneyCompact(dcf.enterpriseValueGordon, ccy),
        netDebt: formatMoneyCompact(dcf.netDebt, ccy),
      },
      lbo: {
        currency: ccy,
        entryEv: formatMoneyCompact(lbo.entryEv, ccy),
        entryDebt: formatMoneyCompact(lbo.entryDebt, ccy),
        entryEquity: formatMoneyCompact(lbo.entryEquity, ccy),
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
  return `You are the Investment Committee secretary for InvestMouse writing a full IC memo, not a tweet.

HARD RULES
- Use ONLY the provided engine metrics. Never invent or recalculate numbers.
- Cite specific figures (IRR, MoIC, DCF price, upside, growth, FCF, leverage) in every section.
- No one-liners. Each persona argument must be 5–8 sentences.
- Each thesis bullet is 2–3 sentences.
- valuationTake is 3–4 sentences on price vs intrinsic value.
- Debate: 6–8 turns, personas ARGUE against each other with figures. Each turn is 3–5 sentences.
- chairSummary is 4–6 sentences: majority view, dissent, and what would change the vote.

VOICES
- Buffett: moat, predictability, margin of safety, simple business, owner earnings.
- Thiel: 10x tech, monopoly, zero-to-one, network effects, why incremental growth is not enough.
- PE Partner: cash conversion, debt service at 6.5%, paydown, cost-out, multiple expansion vs contraction, bull/bear IRR.
- Dalio: cyclicality, inflation/rates, sovereign and supply-chain exposure, stress test of the balance sheet.`;
}

export function icUserPrompt(bundle: EngineBundle): string {
  return `Write a detailed IC memo for this company from the four personas. Do not summarize in a single sentence.\n\n${metricsBrief(bundle)}`;
}
