import type { EngineBundle, Vote } from "@/lib/engines/types";
import { formatCompact, formatMultiple, formatPct, formatPrice } from "@/lib/format";
import type { IcAnalysis } from "./schemas";

const NAMES = {
  buffett: "Warren Buffett",
  thiel: "Peter Thiel",
  pe: "PE Partner",
  dalio: "Ray Dalio",
} as const;

export function fallbackAnalysis(bundle: EngineBundle): IcAnalysis {
  const { financials, vc, lbo, dcf, sliders } = bundle;
  const name = financials.quote.name;
  const ticker = financials.quote.ticker;
  const price = formatPrice(financials.quote.price);
  const dcfPrice = formatPrice(dcf.impliedPriceGordon);
  const upside = formatPct(dcf.upsideGordon);
  const yoy = formatPct(vc.yoyGrowth);
  const gm = formatPct(vc.grossMargin);
  const fcfm = formatPct(vc.fcfMargin);
  const roic = formatPct(vc.roic);
  const irr = formatPct(lbo.base.irr);
  const moic = formatMultiple(lbo.base.moic);
  const bearIrr = formatPct(lbo.bear.irr);
  const bullIrr = formatPct(lbo.bull.irr);
  const nd = formatMultiple(vc.netDebtToEbitda);
  const conv = formatPct(vc.fcfConversion);
  const wacc = formatPct(sliders.wacc);
  const ev = formatCompact(financials.quote.enterpriseValue);

  return {
    narratives: [
      {
        id: "buffett",
        thesis: [
          `${name} (${ticker}) currently trades at ${price}. The Gordon DCF at a ${wacc} WACC implies ${dcfPrice}, or ${upside} versus the quote — that is the entire margin-of-safety question.`,
          `ROIC prints ${roic}. I want a durable double-digit return on capital and at least five years of positive free cash flow before I treat this as a compounder rather than a trading sardine.`,
          `FCF margin is ${fcfm}. Owner earnings must be predictable; a business that cannot convert accounting profit into cash is not a business I want to own through a recession.`,
        ],
        valuationTake: `I do not need a 10x story. I need a price that is wrong versus cash. At ${price} versus ${dcfPrice} intrinsic, the discount or premium is ${upside}. If that gap is not a clear margin of safety, I wait. Net debt of ${formatCompact(dcf.netDebt)} is subtracted from enterprise value — I will not pay up for a balance sheet that has already spent tomorrow's cash.`,
        argument: `${ticker} has to pass a simple test: can an intelligent owner understand the product, forecast cash within a reasonable band, and sleep at night with the leverage? The engines show ROIC of ${roic}, FCF margin of ${fcfm}, and ${vc.positiveFcfYears} years of positive free cash flow in the sample. Those are the facts. Growth of ${yoy} is interesting but secondary; I have seen plenty of high-growth companies destroy capital. Debt-to-equity is ${formatMultiple(vc.debtToEquity)}. If the moat is real — switching costs, brand, or a low-cost position — the DCF gap of ${upside} decides the ticket size. If the business is fashionable but not inevitable, I pass regardless of the multiple.`,
        catalysts: [
          "A pullback that widens the DCF discount beyond 20%.",
          "Evidence that FCF conversion stays high through a slower revenue year.",
        ],
        risks: [
          "A fade in FCF conversion would break the predictability case.",
          "If ROIC is an accounting artifact rather than a moat, the compounder thesis dies.",
        ],
      },
      {
        id: "thiel",
        thesis: [
          `YoY growth is ${yoy} against a 40% monopoly bar. Incremental growth is competition; I am looking for a 10x technological gap.`,
          `Gross margin is ${gm}. Software-like or proprietary tech should clear 70%. Anything in the middle is a feature, not a company.`,
          `EV / Revenue of ${formatMultiple(vc.evRevenue)} only makes sense if this is a category king. Paying a growth multiple for a linear business is how you lose a decade.`,
        ],
        valuationTake: `Buffett's ${upside} DCF 'cheapness' is irrelevant if the technology is not 10x. I would rather overpay for a monopoly than underpay for a commodity. The Rule of 40 prints ${vc.ruleOf40 == null ? "n/a" : vc.ruleOf40.toFixed(1)} — useful, but still a trailing score, not a secret.`,
        argument: `The question is not whether ${ticker} is a good business. It is whether the world looks different because it exists. Growth of ${yoy} and a ${gm} gross margin tell me if this is a zero-to-one franchise or a well-run incumbent. If growth is in the teens and margins are merely decent, every competent competitor can copy the playbook. Network effects, proprietary data, or a technical 10x are the only durable defenses I accept. DCF upside of ${upside} is what you get when the market already understands the story. I pass on understood stories. I invest when the rest of the committee still thinks the category is impossible.`,
        catalysts: [
          "A step-function product or platform that re-accelerates growth above 40%.",
          "Gross margin expansion toward 70%+ as mix shifts to proprietary tech.",
        ],
        risks: [
          "If growth is merely incremental, this is not a zero-to-one company.",
          "A rich EV/Revenue multiple with slowing YoY is a value trap dressed as tech.",
        ],
      },
      {
        id: "pe",
        thesis: [
          `Entry EV is ${formatCompact(lbo.entryEv)} with ${formatPct(sliders.debtPct)} debt. Base IRR is ${irr} and MoIC is ${moic} versus 20% / 2.5x hurdles.`,
          `FCF conversion of ${conv} is what services a 6.5% coupon and 5% annual principal paydown. If conversion holds, the structure works; if it slips, we are a forced seller.`,
          `Bull IRR is ${bullIrr} and bear is ${bearIrr}. I underwrite the bear before I celebrate the base.`,
        ],
        valuationTake: `We are not buying a narrative; we are buying a cash-flow duration. Exit at ${formatMultiple(sliders.exitMultiple)} on year-5 EBITDA. If entry EV/EBITDA is richer than that exit, we need volume, margin, or debt paydown to manufacture the return. Base MoIC of ${moic} is the only number that matters in the IC book.`,
        argument: `On a ${formatCompact(lbo.entryEquity)} equity check against ${formatCompact(lbo.entryDebt)} of debt, ${ticker} has to throw off cash every year. EBITDA margin is ${formatPct(vc.ebitdaMargin)}. Conversion is ${conv}. Interest is 6.5% and we amortize 5% of opening principal. That is a boring machine, which is the point. I want cost-out optionality and a path to hold leverage inside 2x by exit. The bear case — 15% less EBITDA — drops IRR to ${bearIrr}. If that bear still clears our cost of equity, we can be aggressive. If it does not, we shrink the check or we walk. Multiple expansion is a wish; paydown and margin are a plan.`,
        catalysts: [
          "Cost program that lifts EBITDA margin without starving growth capex.",
          "Faster de-levering if FCF conversion stays above 60%.",
        ],
        risks: [
          `Bear IRR of ${bearIrr} if EBITDA is 15% light.`,
          "Entry multiple above the 20x slider cap means we are underwriting contraction.",
        ],
      },
      {
        id: "dalio",
        thesis: [
          `Net debt / EBITDA is ${nd}. That is the first stress-test gate before I care about IRR or DCF.`,
          `${ticker} sits in ${financials.quote.sector || "its sector"} with an enterprise value of ${ev}. I map it to the cycle: growth, inflation, and tightness of money.`,
          `A rates shock re-prices WACC and the exit multiple at the same time. The DCF already uses ${wacc}; if the discount rate steps up 200 bps, the ${upside} gap can vanish.`,
        ],
        valuationTake: `I do not vote on base-case beauty. I vote on whether the balance sheet survives the next downturn. Cash conversion of ${conv} and leverage of ${nd} decide if this is an inflation hedge or a duration asset pretending to be a compounder.`,
        argument: `Every beautiful IRR assumes the cycle stays friendly. I assume it does not. If inflation stays sticky, nominal growth may help revenue but working capital and rates will tax FCF. If we get a disinflation shock, multiples compress and the LBO exit of ${formatMultiple(sliders.exitMultiple)} is no longer available. Sovereign and supply-chain exposure matter as much as the spreadsheet. ${ticker} must show it can fund itself when credit is closed. Positive FCF in ${vc.positiveFcfYears} of the sample years is useful; consecutive coverage is ${vc.consecutivePositiveFcf ? "intact" : "broken"}. I will not add leverage to a name that already looks like a late-cycle duration bet.`,
        catalysts: [
          "A cleaner net-debt position below 2x EBITDA.",
          "Evidence the model holds if WACC is 200 bps higher.",
        ],
        risks: [
          "Rates and exit multiple can gap against us in the same quarter.",
          "Supply-chain or sovereign concentration is not in the three-statement model.",
        ],
      },
    ],
    debate: [
      {
        speaker: "thiel",
        text: `Warren, you are anchoring on ${upside} of DCF upside as if cheapness were a strategy. Growth is ${yoy}. If this is not a 10x technology, a lower multiple just means the market already knows the product is copyable. I would rather miss a 'safe' compounder than own a value trap that looks responsible in a spreadsheet.`,
      },
      {
        speaker: "buffett",
        text: `Peter, growth that does not convert to cash is theatre. FCF margin is ${fcfm} and ROIC is ${roic}. I have no interest in paying for a story that has not yet shown up in owner earnings. If the moat is real, ${dcfPrice} versus ${price} is the only negotiation. If it is not, your 40% hurdle is a slogan.`,
      },
      {
        speaker: "pe",
        text: `Gentlemen, the model is the model. We put ${formatPct(sliders.debtPct)} debt on ${formatCompact(lbo.entryEv)} of entry EV. Base IRR is ${irr} on ${moic} MoIC. If FCF conversion stays at ${conv}, we can pay 6.5% and amortize. I do not need a monopoly and I do not need a cigar butt. I need cash that shows up on Tuesday.`,
      },
      {
        speaker: "dalio",
        text: `A 15% EBITDA miss drops IRR to ${bearIrr}. Pair that with net leverage of ${nd} and you have a cycle problem, not a stock story. When the next tightening comes, WACC and the exit multiple move together. Anyone underwriting only the base case is not doing risk parity; they are doing hope.`,
      },
      {
        speaker: "thiel",
        text: `The PE book will optimize a mediocre asset until it is a slightly better mediocre asset. Gross margin of ${gm} and YoY of ${yoy} do not become a monopoly because you levered them 50/50. If we cannot describe the 10x, we should not be in the room.`,
      },
      {
        speaker: "pe",
        text: `Bull IRR is ${bullIrr}. That is the option value if operations work. I will take a known cash machine over a philosophical monopoly. We can argue ideology after the debt is down. Until then, conversion and covenants run the meeting.`,
      },
    ],
    chairSummary: `The engines have spoken in numbers: DCF ${dcfPrice} versus ${price} (${upside}), LBO IRR ${irr} / MoIC ${moic}, growth ${yoy}, FCF margin ${fcfm}, leverage ${nd}. Buffett will not stretch without a wider margin of safety. Thiel will not stretch without monopoly economics. The PE seat will stretch if conversion holds through the bear. Dalio will veto if the cycle and the balance sheet disagree. Majority is a ${bundle.personas.filter((p) => p.vote !== "pass").length >= 2 ? "conditional" : "cautious"} posture until one of those facts changes — a cheaper quote, faster growth, or cleaner leverage.`,
  };
}

export function majorityVote(votes: Vote[]): Vote {
  const score = { strong_invest: 0, conditional_invest: 0, pass: 0 };
  for (const v of votes) score[v] += 1;
  if (score.strong_invest >= 2) return "strong_invest";
  if (score.pass >= 3) return "pass";
  if (score.strong_invest + score.conditional_invest >= 2) return "conditional_invest";
  return score.pass > score.strong_invest ? "pass" : "conditional_invest";
}

export { NAMES };
