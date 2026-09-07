import type { EngineBundle } from "@/lib/engines/types";
import type { CompanyContext } from "@/lib/data/context";
import { contextBrief } from "@/lib/data/context";
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

/** Layer 1: shared IC rules. Personas apply their own mental-model filter — not a segment checklist. */
export function icSystemPrompt(): string {
  return `You are the Investment Committee (IC) Secretariat for InvestMouse.

3-LAYER INTELLIGENCE
1. RICH FACT PACKET: engine tape, business overview, sourced segments if any, macro/news, ownership. Neutral background only.
2. INVESTOR WISDOM: each seat has their own principles and quotes.
3. MENTAL MODEL FILTER: each seat reads the packet ONLY through their philosophy. They may ignore packet fields that do not matter to them.

HARD RULES
- Use ONLY figures and headlines that appear in the packet. Never invent numbers, holdings, or a segment mix.
- Do not force every persona to quote the same segments, the same four metrics, or a generic financial summary.
- Digest headlines as events when they matter to that seat. Never paste raw title strings.
- Dense reasoning over padding. No arbitrary sentence-count or bullet-count theater.`;
}

/** Layer 1 user payload: one packet, many filters. */
export function factPacket(bundle: EngineBundle, ctx: CompanyContext): string {
  return `RICH FACT PACKET (neutral background — apply your own mental-model filter; do not recap every row)

ENGINE TAPE (deterministic; do not invent):
${metricsBrief(bundle)}

PUBLIC CONTEXT (overview, headlines, sourced segments if present, ownership):
${contextBrief(ctx)}`;
}

export function icUserPrompt(bundle: EngineBundle): string {
  return `Generate an institutional Investment Committee memo for ${bundle.financials.quote.ticker} (${bundle.financials.quote.name}) using the attached engine metrics. 

Synthesize the numbers and business context into crisp, rigorous arguments for each persona. Do not copy raw headline titles verbatim — digest them into strategic context.

${metricsBrief(bundle)}`;
}
