import type { Locale } from "@/lib/i18n/messages";
import { majorityVote } from "./personas";
import type { IcAnalysis } from "./schemas";

export type DebateVerdict = "PASS" | "INVEST" | "CONDITIONAL";
export type VoteFamily = "pass" | "invest";
export type DebateMode = "unanimous_pass" | "unanimous_invest" | "split";

export function debateVerdict(
  vote: IcAnalysis["narratives"][number]["vote"],
): DebateVerdict {
  if (vote === "pass") return "PASS";
  if (vote === "conditional_invest") return "CONDITIONAL";
  return "INVEST";
}

export function voteFamily(verdict: DebateVerdict): VoteFamily {
  return verdict === "PASS" ? "pass" : "invest";
}

export function votingResults(
  narratives: IcAnalysis["narratives"],
): Record<(typeof narratives)[number]["id"], DebateVerdict> {
  return {
    buffett: debateVerdict(narratives.find((n) => n.id === "buffett")?.vote ?? "pass"),
    thiel: debateVerdict(narratives.find((n) => n.id === "thiel")?.vote ?? "pass"),
    pe: debateVerdict(narratives.find((n) => n.id === "pe")?.vote ?? "pass"),
    dalio: debateVerdict(narratives.find((n) => n.id === "dalio")?.vote ?? "pass"),
  };
}

export function debateMode(votes: ReturnType<typeof votingResults>): DebateMode {
  const families = [votes.buffett, votes.thiel, votes.pe, votes.dalio].map(voteFamily);
  if (families.every((f) => f === "pass")) return "unanimous_pass";
  if (families.every((f) => f === "invest")) return "unanimous_invest";
  return "split";
}

export function sameVerdictFamily(a: DebateVerdict, b: DebateVerdict): boolean {
  return voteFamily(a) === voteFamily(b);
}

export function pairingRule(previous: DebateVerdict, current: DebateVerdict): "agree_on_verdict" | "challenge_thesis" {
  return sameVerdictFamily(previous, current) ? "agree_on_verdict" : "challenge_thesis";
}

export function debateTurnGuide(votes: ReturnType<typeof votingResults>): string {
  const mode = debateMode(votes);
  const roll = `VOTING_RESULTS=${JSON.stringify(votes)} MODE=${mode}`;
  if (mode === "unanimous_pass") {
    return `${roll}
UNANIMOUS PASS: Do NOT repeat "I agree with PASS". Debate the PRIORITY OF FAILURE — each speaker argues why THEIR lens shows the most fatal flaw (moat decay vs 10x absence vs un-bankable cash vs macro/credit).`;
  }
  if (mode === "unanimous_invest") {
    return `${roll}
UNANIMOUS INVEST: Do NOT repeat "I agree we should invest". Debate the PRIORITY OF UPSIDE — each speaker argues why THEIR lens is the binding reason to own the name.`;
  }
  return `${roll}
SPLIT: INVEST/CONDITIONAL speakers MUST challenge PASS assumptions. PASS speakers MUST attack the bull case. No ritual agreement.`;
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 220 ? `${clean.slice(0, 217)}…` : clean;
}

const NAMES_EN = { buffett: "Buffett", thiel: "Thiel", pe: "the PE partner", dalio: "Dalio" } as const;
const NAMES_ZH = { buffett: "巴菲特", thiel: "Thiel", pe: "PE Partner", dalio: "達利歐" } as const;
const ANGLES_EN = {
  buffett: "moat and capital allocation",
  thiel: "monopoly vs commodity tech",
  pe: "supply chain and debt coverage",
  dalio: "cycle and refinancing risk",
} as const;
const ANGLES_ZH = {
  buffett: "護城河與資本配置",
  thiel: "壟斷對商品化科技",
  pe: "供應鏈與債務覆蓋",
  dalio: "周期與再融資風險",
} as const;

/** Four turns from finished memos — new qualitative angle each time, no invented figures. */
export function fallbackDebate(
  narratives: IcAnalysis["narratives"],
  locale: Locale = "en",
): Pick<IcAnalysis, "debate" | "chairSummary"> {
  const byId = Object.fromEntries(narratives.map((n) => [n.id, n])) as Record<
    IcAnalysis["narratives"][number]["id"],
    IcAnalysis["narratives"][number]
  >;
  const votes = votingResults(narratives);
  const mode = debateMode(votes);
  const names = locale === "zh" ? NAMES_ZH : NAMES_EN;
  const angles = locale === "zh" ? ANGLES_ZH : ANGLES_EN;
  const body = (id: IcAnalysis["narratives"][number]["id"]) =>
    clip(byId[id]?.thesis?.[0] || byId[id]?.valuationTake || "");

  const turn = (
    speaker: IcAnalysis["narratives"][number]["id"],
    prev?: IcAnalysis["narratives"][number]["id"],
  ) => {
    if (locale === "zh") {
      if (mode === "unanimous_pass") {
        return `我投 PASS，但最致命的是${angles[speaker]}，不是重複投票。${body(speaker)}`;
      }
      if (mode === "unanimous_invest") {
        return `我投 ${votes[speaker]}，綁定理由是${angles[speaker]}。${body(speaker)}`;
      }
      if (prev && pairingRule(votes[prev], votes[speaker]) === "challenge_thesis") {
        return `針對${names[prev]}的${votes[prev]}：我的${votes[speaker]}來自${angles[speaker]}。${body(speaker)}`;
      }
      return `從${angles[speaker]}看，我的投票是${votes[speaker]}。${body(speaker)}`;
    }
    if (mode === "unanimous_pass") {
      return `PASS, but the binding failure is ${angles[speaker]} — not a repeated vote. ${body(speaker)}`;
    }
    if (mode === "unanimous_invest") {
      return `${votes[speaker]} because ${angles[speaker]} is the binding reason to own it. ${body(speaker)}`;
    }
    if (prev && pairingRule(votes[prev], votes[speaker]) === "challenge_thesis") {
      return `Against ${names[prev]}'s ${votes[prev]}: my ${votes[speaker]} sits on ${angles[speaker]}. ${body(speaker)}`;
    }
    return `From ${angles[speaker]}, the vote is ${votes[speaker]}. ${body(speaker)}`;
  };

  const majority = majorityVote(narratives.map((n) => n.vote));
  const chairSummary =
    locale === "zh"
      ? `多數意見為${majority === "pass" ? "不通過" : majority === "strong_invest" ? "強烈建議投資" : "有條件投資"}（${mode}）。翻轉多數須改變其中一人的門檻。`
      : `Majority is ${majority.replaceAll("_", " ")} (${mode}). A flip requires one hurdle to move.`;

  return {
    debate: [
      { speaker: "buffett", text: turn("buffett") },
      { speaker: "thiel", text: turn("thiel", "buffett") },
      { speaker: "pe", text: turn("pe", "thiel") },
      { speaker: "dalio", text: turn("dalio", "pe") },
    ],
    chairSummary,
  };
}

export function debateSystemPrompt(votes: ReturnType<typeof votingResults>): string {
  const mode = debateMode(votes);
  return `You are the IC secretary recording FOUR turns of intellectual friction, not a pile-on.
VOTING_RESULTS (binding): ${JSON.stringify(votes)}
MODE: ${mode}

${debateTurnGuide(votes)}

STRUCTURE (exactly 4 turns, one each):
1. Buffett opens with his ${votes.buffett} and ONE qualitative claim (moat / management / capital allocation).
2. Thiel replies to Buffett BY NAME with a NEW angle (10x / monopoly / commodity). Do not repeat Buffett's metrics.
3. PE replies to Thiel BY NAME with a NEW angle (operations, supply chain, leverage). Do not repeat prior figures.
4. Dalio replies to PE BY NAME with a NEW angle (cycle, rates, sovereign). Do not repeat prior figures.

ANTI-REPETITION: Speaker N must not restate numbers or failure modes already named. Introduce a new qualitative cut.
FORBIDDEN: "I agree with PASS/INVEST" as the substance of a turn; parallel monologues; a fifth turn.
chairSummary: exactly two sentences. Match VOTING_RESULTS.`;
}
