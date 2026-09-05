import type { EngineBundle, Vote } from "@/lib/engines/types";
import { formatMultiple, formatPct } from "@/lib/format";
import type { IcAnalysis } from "./schemas";

const NAMES = {
  buffett: "Warren Buffett",
  thiel: "Peter Thiel",
  pe: "PE Partner",
  dalio: "Ray Dalio",
} as const;

export function fallbackAnalysis(bundle: EngineBundle): IcAnalysis {
  const { vc, lbo, dcf } = bundle;
  return {
    narratives: [
      {
        id: "buffett",
        thesis: [
          `ROIC prints ${formatPct(vc.roic)}; quality compounders need durable double-digit returns on capital.`,
          `DCF (Gordon) implies ${formatPct(dcf.upsideGordon)} versus the current quote — that is the margin of safety test.`,
        ],
        risks: ["Any fade in FCF conversion would break the predictability case."],
        argument:
          "I only pay up for businesses I can understand with five years of positive free cash flow and a wide moat.",
      },
      {
        id: "thiel",
        thesis: [
          `YoY growth is ${formatPct(vc.yoyGrowth)} versus a 40% monopoly bar.`,
          `Gross margin ${formatPct(vc.grossMargin)} tells us whether this is a 10x technology or a commodity.`,
        ],
        risks: ["If growth is merely incremental, this is not a zero-to-one company."],
        argument:
          "Competition is for losers. Unless this looks like a monopoly, I pass regardless of DCF cheapness.",
      },
      {
        id: "pe",
        thesis: [
          `Base LBO IRR ${formatPct(lbo.base.irr)} and MoIC ${formatMultiple(lbo.base.moic)} versus 20% / 2.5x hurdles.`,
          `FCF conversion ${formatPct(vc.fcfConversion)} drives debt paydown at 6.5% coupon.`,
        ],
        risks: [`Bear IRR compresses to ${formatPct(lbo.bear.irr)} if EBITDA is 15% light.`],
        argument:
          "We underwrite cash, not stories. If conversion holds, the capital structure works.",
      },
      {
        id: "dalio",
        thesis: [
          `Net debt / EBITDA is ${formatMultiple(vc.netDebtToEbitda)} — the first stress-test gate.`,
          "Map this name to the cycle: inflation, rates, and supply-chain concentration.",
        ],
        risks: ["A rates shock re-prices both WACC and exit multiple simultaneously."],
        argument:
          "I care whether the balance sheet survives the next downturn, not the base-case IRR.",
      },
    ],
    debate: [
      {
        speaker: "thiel",
        text: `Buffett is anchoring on ${formatPct(dcf.upsideGordon)} DCF upside and ignoring ${formatPct(vc.yoyGrowth)} growth. That is a value trap if the technology is not 10x.`,
      },
      {
        speaker: "buffett",
        text: `Growth that does not convert to cash is theatre. FCF margin is ${formatPct(vc.fcfMargin)}. I will not pay for hope.`,
      },
      {
        speaker: "pe",
        text: `Gentlemen, the model is the model. Base IRR ${formatPct(lbo.base.irr)} on ${formatMultiple(lbo.base.moic)} MoIC. If FCF conversion stays above 60%, we can service the structure.`,
      },
      {
        speaker: "dalio",
        text: `A 15% EBITDA miss drops IRR to ${formatPct(lbo.bear.irr)}. Pair that with net leverage ${formatMultiple(vc.netDebtToEbitda)} and you have a cycle problem, not a stock story.`,
      },
    ],
    chairSummary:
      "Quantitative scorecards are live from the engines. LLM narrative is offline — showing rule-based IC script.",
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
