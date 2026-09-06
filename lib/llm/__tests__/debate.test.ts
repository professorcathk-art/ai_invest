import { describe, expect, it } from "vitest";
import {
  debateMode,
  debateTurnGuide,
  debateVerdict,
  fallbackDebate,
  pairingRule,
  sameVerdictFamily,
  votingResults,
} from "../debate";
import type { IcAnalysis } from "../schemas";

function narrative(
  id: IcAnalysis["narratives"][number]["id"],
  vote: IcAnalysis["narratives"][number]["vote"],
): IcAnalysis["narratives"][number] {
  return {
    id,
    vote,
    conviction: 70,
    thesis: ["a", "b", "c"],
    valuationTake: "take",
    argument: "arg",
    catalysts: ["c1", "c2"],
    risks: ["r1", "r2"],
  };
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

  it("flags unanimous PASS vs split", () => {
    const unanimous = votingResults([
      narrative("buffett", "pass"),
      narrative("thiel", "pass"),
      narrative("pe", "pass"),
      narrative("dalio", "pass"),
    ]);
    const split = votingResults([
      narrative("buffett", "pass"),
      narrative("thiel", "pass"),
      narrative("pe", "pass"),
      narrative("dalio", "conditional_invest"),
    ]);
    expect(debateMode(unanimous)).toBe("unanimous_pass");
    expect(debateTurnGuide(unanimous)).toContain("PRIORITY OF FAILURE");
    expect(debateMode(split)).toBe("split");
    expect(debateTurnGuide(split)).toContain("SPLIT");
  });

  it("stitches four debate turns without timeout copy", () => {
    const part = fallbackDebate(
      [
        narrative("buffett", "pass"),
        narrative("thiel", "pass"),
        narrative("pe", "pass"),
        narrative("dalio", "pass"),
      ],
      "zh",
    );
    expect(part.debate).toHaveLength(4);
    expect(part.debate[1]?.text).toContain("最致命");
    expect(part.chairSummary).not.toMatch(/逾時|timeout/i);
  });
});
