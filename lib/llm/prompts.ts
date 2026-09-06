import type { EngineBundle } from "@/lib/engines/types";
import type { Locale } from "@/lib/i18n/messages";
import { formatMoney, formatMoneyCompact, formatMultiple, formatPct } from "@/lib/format";

/** Used by every IC memo and debate turn. Edit here to change language. */
export function languageRule(locale: Locale): string {
  if (locale !== "zh") return "Write all string fields in English.";
  return `LANGUAGE (binding):
- Write EVERY string field in Traditional Chinese 書面語 (現代漢語書面語, 繁體字).
- This is formal written Chinese as used in HK/TW newspapers, filings, and research notes — NOT spoken Cantonese.
- Forbidden spoken-Cantonese particles and grammar: 嘅、係、唔、冇、喺、咁、噉、嘅話、我哋、你哋、佢哋、呢個、嗰個、咗、緊、嚟、咪、啲、咁樣、唔係、唔好、點解、邊度.
- Use written equivalents: 的／之、是、不、沒有、在、如此、我們、這個、那個、了、正在、來、不要、為什麼、哪裡.
- Keep JSON keys, ticker symbols, and Arabic numerals unchanged.`;
}

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
        impliedPriceGordon:
          dcf.impliedPriceGordon > 0
            ? formatMoney(dcf.impliedPriceGordon, ccy)
            : `${ccy} 0.00 (floored at zero; FCF does not support positive equity)`,
        impliedPriceExit:
          dcf.impliedPriceExit > 0
            ? formatMoney(dcf.impliedPriceExit, ccy)
            : `${ccy} 0.00 (floored at zero; FCF does not support positive equity)`,
        upsideGordon:
          dcf.impliedPriceGordon > 0 ? formatPct(dcf.upsideGordon) : "n/a (equity floored at zero)",
        upsideExit: dcf.impliedPriceExit > 0 ? formatPct(dcf.upsideExit) : "n/a (equity floored at zero)",
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
  return `You are the Investment Committee (IC) Secretariat for InvestMouse, producing institutional-grade investment research memos.

CRITICAL ANALYTICAL RULES
1. NUMERICAL ACCURACY: Use ONLY the provided engine metrics (DCF prices, LBO IRR/MoIC, ROIC, Rule of 40, Leverage). Never invent numbers.
2. MARKET CATALYST SYNTHESIS: Integrate recent news headlines logically as underlying BUSINESS EVENTS or MARKET CATALYSTS (e.g., earnings misses, macro headwinds, margin pressures). DO NOT copy-paste raw headline title strings verbatim into sentences.
3. DENSE LOGIC OVER BLOAT: Focus on financial logic and strategic moats. Avoid generic fluff. Structure each persona's output into distinct analytical paragraphs rather than chasing arbitrary sentence counts.

INVESTOR PERSONA PERSPECTIVES
- Buffett: Focus on durable business moats, predictability of cash flows, capital allocation discipline, ROIC vs WACC, and Margin of Safety.
- Thiel: Focus on 10x technological advantage, monopoly potential, network effects, and "Zero to One" scalability vs linear commodity businesses.
- PE Partner: Focus on debt serviceability (at 6.5% interest), free cash flow conversion, EBITDA margin defense, down-side protection, and 5-year Base/Bear IRR.
- Dalio: Focus on macroeconomic cycle positioning, inflation/interest rate sensitivity, balance sheet leverage resilience, and sovereign/supply-chain risk exposure.`;
}

export function icUserPrompt(bundle: EngineBundle): string {
  return `Generate an institutional Investment Committee memo for ${bundle.financials.quote.ticker} (${bundle.financials.quote.name}) using the attached engine metrics. 

Synthesize the numbers and business context into crisp, rigorous arguments for each persona. Do not copy raw headline titles verbatim — digest them into strategic context.

${metricsBrief(bundle)}`;
}
