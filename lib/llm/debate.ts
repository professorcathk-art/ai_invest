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
