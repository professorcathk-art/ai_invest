import { describe, expect, it } from "vitest";
import {
  debateMode,
  debateSystemPrompt,
  debateTurnBounds,
  debateTurnGuide,
  debateVerdict,
  fallbackDebate,
  isValidDebateLength,
  normalizeDebateOutput,
  pairingRule,
  sameVerdictFamily,
  speakerSequence,
  votingResults,
} from "../debate";
import type { IcAnalysis } from "../schemas";
import { icAnalysisSchema } from "../schemas";

function narrative(
  id: IcAnalysis["narratives"][number]["id"],
  vote: IcAnalysis["narratives"][number]["vote"],
  conviction = 70,
  thesis = ["Cash conversion is the binding test for this name."],
): IcAnalysis["narratives"][number] {
  return {
    id,
    vote,
    conviction,
    thesis: [thesis[0] ?? "a", "b", "c"],
    valuationTake: "take",
    argument: "arg",
    catalysts: ["c1", "c2"],
    risks: ["r1", "r2"],
  };
}

/** Typical expensive HK compounder: all four pass — Tencent-style. */
function tencentUnanimousPass() {
  return [
    narrative("buffett", "pass", 82, ["0700.HK trades above a cash margin of safety."]),
    narrative("thiel", "pass", 74, ["The platform is wide but not a 10x monopoly increment."]),
    narrative("pe", "pass", 68, ["Leverage is light but the entry multiple is not bankable."]),
    narrative("dalio", "pass", 61, ["A rates shock would re-price the duration embedded in the multiple."]),
  ] satisfies IcAnalysis["narratives"];
}

/** Split IC: bulls vs bears, including one CONDITIONAL swing vote. */
function splitCommittee() {
  return [
    narrative("buffett", "pass", 80),
    narrative("thiel", "strong_invest", 88),
    narrative("pe", "pass", 72),
    narrative("dalio", "conditional_invest", 64),
  ] satisfies IcAnalysis["narratives"];
}

describe("debate vote pairing", () => {
  it("maps votes to PASS / INVEST / CONDITIONAL", () => {
    expect(debateVerdict("pass")).toBe("PASS");
    expect(debateVerdict("strong_invest")).toBe("INVEST");
    expect(debateVerdict("conditional_invest")).toBe("CONDITIONAL");
  });

  it("treats CONDITIONAL as the invest family, not a clash with INVEST", () => {
    expect(sameVerdictFamily("CONDITIONAL", "INVEST")).toBe(true);
    expect(sameVerdictFamily("PASS", "PASS")).toBe(true);
    expect(sameVerdictFamily("PASS", "INVEST")).toBe(false);
    expect(pairingRule("PASS", "PASS")).toBe("agree_on_verdict");
    expect(pairingRule("INVEST", "PASS")).toBe("challenge_thesis");
  });

  it("flags 0700.HK-style unanimous PASS versus a split IC", () => {
    const unanimous = votingResults(tencentUnanimousPass());
    const split = votingResults(splitCommittee());
    expect(debateMode(unanimous)).toBe("unanimous_pass");
    expect(debateTurnBounds("unanimous_pass")).toEqual({ min: 3, max: 3, target: 3 });
    expect(debateTurnGuide(unanimous)).toContain("CONSENSUS EARLY-EXIT");
    expect(debateMode(split)).toBe("split");
    expect(debateTurnBounds("split")).toEqual({ min: 6, max: 8, target: 6 });
    expect(debateTurnGuide(split)).toContain("SPLIT FRICTION");
  });

  it("treats all-CONDITIONAL or all-INVEST as a 3-turn consensus", () => {
    const allConditional = votingResults([
      narrative("buffett", "conditional_invest"),
      narrative("thiel", "conditional_invest"),
      narrative("pe", "conditional_invest"),
      narrative("dalio", "conditional_invest"),
    ]);
    expect(debateMode(allConditional)).toBe("unanimous_invest");
    expect(debateTurnBounds(debateMode(allConditional)).max).toBe(3);
  });
});

describe("dynamic speaker sequence", () => {
  it("does not hardcode Buffett → Thiel → PE → Dalio on a 0700.HK unanimous tape", () => {
    const narratives = tencentUnanimousPass();
    const seq = speakerSequence(narratives);
    expect(seq).toHaveLength(3);
    expect(seq[0]).toBe("buffett");
    expect(seq[1]).toBe("dalio");
    expect(new Set(seq).size).toBe(3);
  });

  it("alternates bull and bear on a split tape and ends with a swing vote", () => {
    const narratives = splitCommittee();
    const votes = votingResults(narratives);
    const seq = speakerSequence(narratives, votes, 6);
    expect(seq).toHaveLength(6);
    expect(votes[seq[0]!]).not.toBe("PASS");
    expect(votes[seq[1]!]).toBe("PASS");
    expect(votes[seq[2]!]).not.toBe("PASS");
    expect(votes[seq[3]!]).toBe("PASS");
    expect(seq[5]).toBe("dalio");
  });
});

describe("prompt and output validation", () => {
  it("asks for cross-examination, persuasion conditions, and a dynamic turn count", () => {
    const votes = votingResults(splitCommittee());
    const prompt = debateSystemPrompt(votes, speakerSequence(splitCommittee(), votes));
    expect(prompt).toContain("DIRECT CROSS-EXAMINATION");
    expect(prompt).toContain("VOTE PERSUASION");
    expect(prompt).toContain("TURN_COUNT: write exactly 6");
    expect(prompt).not.toMatch(/exactly 4 turns/i);
    expect(prompt).not.toMatch(/Buffett opens with his/i);
  });

  it("trims oversized transcripts and rejects short split debates", () => {
    const votes = votingResults(splitCommittee());
    const padded = normalizeDebateOutput(
      {
        debate: Array.from({ length: 9 }, (_, i) => ({
          speaker: i % 2 === 0 ? "thiel" : "buffett",
          text: `Turn ${i}`,
        })),
        chairSummary: "Split committee. CapEx intensity is the flip.",
      },
      votes,
    );
    expect(padded.debate).toHaveLength(8);
    expect(isValidDebateLength(padded.debate.length, "split")).toBe(true);
    expect(isValidDebateLength(5, "split")).toBe(false);
    expect(isValidDebateLength(3, "unanimous_pass")).toBe(true);
    expect(isValidDebateLength(4, "unanimous_pass")).toBe(false);
  });
});

describe("fallback debate", () => {
  it("closes a 0700.HK unanimous PASS in three turns of written Chinese", () => {
    const part = fallbackDebate(tencentUnanimousPass(), "zh");
    expect(part.debate).toHaveLength(3);
    expect(part.debate[1]?.text).toMatch(/尾部風險|忽略/);
    expect(part.chairSummary).not.toMatch(/逾時|timeout/i);
    expect(part.debate.some((t) => /嘅|係|唔|冇/.test(t.text))).toBe(false);
    expect(icAnalysisSchema.pick({ debate: true, chairSummary: true }).parse(part)).toEqual(part);
  });

  it("runs six cross-examination turns on a split vote", () => {
    const part = fallbackDebate(splitCommittee(), "en");
    expect(part.debate).toHaveLength(6);
    expect(part.debate[1]?.text).toMatch(/sidesteps|landed|thesis ignores|your /i);
    expect(part.debate.at(-1)?.text).toMatch(/Compromise|only if/i);
    expect(part.chairSummary).toMatch(/split/i);
  });
});
