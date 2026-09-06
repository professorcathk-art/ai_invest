import { describe, expect, it } from "vitest";
import {
  debateTurnGuide,
  debateVerdict,
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

  it("builds voting_results and turn rules from narratives", () => {
    const votes = votingResults([
      narrative("buffett", "pass"),
      narrative("thiel", "pass"),
      narrative("pe", "pass"),
      narrative("dalio", "conditional_invest"),
    ]);
    expect(votes).toEqual({
      buffett: "PASS",
      thiel: "PASS",
      pe: "PASS",
      dalio: "CONDITIONAL",
    });
    const guide = debateTurnGuide(votes);
    expect(guide).toContain("thiel replies to buffett");
    expect(guide).toContain("MUST agree");
    expect(guide).toContain("dalio replies to pe");
    expect(guide).toContain("MUST challenge");
  });
});
