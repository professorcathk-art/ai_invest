import type { Locale } from "@/lib/i18n/messages";
import { majorityVote } from "./personas";
import type { IcAnalysis } from "./schemas";

export type DebateVerdict = "PASS" | "INVEST" | "CONDITIONAL";
export type VoteFamily = "pass" | "invest";

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

export function sameVerdictFamily(a: DebateVerdict, b: DebateVerdict): boolean {
  return voteFamily(a) === voteFamily(b);
}

export function pairingRule(previous: DebateVerdict, current: DebateVerdict): "agree_on_verdict" | "challenge_thesis" {
  return sameVerdictFamily(previous, current) ? "agree_on_verdict" : "challenge_thesis";
}

export function debateTurnGuide(votes: ReturnType<typeof votingResults>): string {
  const pairs: Array<[string, string, DebateVerdict, DebateVerdict]> = [
    ["buffett", "thiel", votes.buffett, votes.thiel],
    ["thiel", "pe", votes.thiel, votes.pe],
    ["pe", "dalio", votes.pe, votes.dalio],
  ];
  return pairs
    .map(([prev, next, a, b]) => {
      const rule = pairingRule(a, b);
      if (rule === "agree_on_verdict") {
        return `${next} replies to ${prev}: both voted ${a === b ? a : `${a} / ${b}`} (same PASS/INVEST family). ${next} MUST agree with the ${a} verdict, but MAY criticize ${prev}'s framework or metrics.`;
      }
      return `${next} replies to ${prev}: ${prev}=${a}, ${next}=${b} (opposite families). ${next} MUST challenge ${prev}'s thesis and vote.`;
    })
    .join("\n");
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 280 ? `${clean.slice(0, 277)}…` : clean;
}

const NAMES_EN = { buffett: "Buffett", thiel: "Thiel", pe: "the PE partner", dalio: "Dalio" } as const;
const NAMES_ZH = { buffett: "巴菲特", thiel: "Thiel", pe: "PE Partner", dalio: "達利歐" } as const;

/** Stitches the four finished memos into six turns — never invents new figures. */
export function fallbackDebate(
  narratives: IcAnalysis["narratives"],
  locale: Locale = "en",
): Pick<IcAnalysis, "debate" | "chairSummary"> {
  const byId = Object.fromEntries(narratives.map((n) => [n.id, n])) as Record<
    IcAnalysis["narratives"][number]["id"],
    IcAnalysis["narratives"][number]
  >;
  const votes = votingResults(narratives);
  const names = locale === "zh" ? NAMES_ZH : NAMES_EN;
  const body = (id: IcAnalysis["narratives"][number]["id"]) =>
    clip(byId[id]?.argument || byId[id]?.valuationTake || "");

  const reply = (
    prev: IcAnalysis["narratives"][number]["id"],
    next: IcAnalysis["narratives"][number]["id"],
  ) => {
    const agree = pairingRule(votes[prev], votes[next]) === "agree_on_verdict";
    if (locale === "zh") {
      return agree
        ? `我同意${names[prev]}的${votes[prev]}結論，但框架不同。${body(next)}`
        : `我不能接受${names[prev]}的${votes[prev]}。我的投票是${votes[next]}。${body(next)}`;
    }
    return agree
      ? `I agree with ${names[prev]}'s ${votes[prev]} verdict, but not the framework. ${body(next)}`
      : `I reject ${names[prev]}'s ${votes[prev]}. My vote is ${votes[next]}. ${body(next)}`;
  };

  const open =
    locale === "zh"
      ? `我投${votes.buffett}。${body("buffett")}`
      : `I vote ${votes.buffett}. ${body("buffett")}`;

  const majority = majorityVote(narratives.map((n) => n.vote));
  const chairSummary =
    locale === "zh"
      ? `多數意見為${majority === "pass" ? "不通過" : majority === "strong_invest" ? "強烈建議投資" : "有條件投資"}。巴菲特${votes.buffett}、Thiel ${votes.thiel}、PE ${votes.pe}、達利歐${votes.dalio}。翻轉多數須改變其中一人的投票門檻。`
      : `Majority is ${majority.replaceAll("_", " ")}. Buffett ${votes.buffett}, Thiel ${votes.thiel}, PE ${votes.pe}, Dalio ${votes.dalio}. A flip requires one of those hurdles to move.`;

  return {
    debate: [
      { speaker: "buffett", text: open },
      { speaker: "thiel", text: reply("buffett", "thiel") },
      { speaker: "pe", text: reply("thiel", "pe") },
      { speaker: "dalio", text: reply("pe", "dalio") },
      { speaker: "buffett", text: reply("dalio", "buffett") },
      { speaker: "thiel", text: reply("buffett", "thiel") },
    ],
    chairSummary,
  };
}
