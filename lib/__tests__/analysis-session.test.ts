import { describe, expect, it } from "vitest";
import { keepFreshEntries, LOCAL_ANALYSIS_TTL_MS } from "../analysis-session";
import type { IcAnalysis } from "@/lib/llm/schemas";

const analysis = {
  narratives: [{ id: "buffett", vote: "BUY", conviction: 70, thesis: "x", catalysts: [], risks: [] }],
  debate: [{ speaker: "buffett", text: "ok" }],
  chairSummary: "ok",
} as unknown as IcAnalysis;

describe("keepFreshEntries", () => {
  it("keeps a memo inside 72h and drops an older one", () => {
    const now = Date.parse("2026-09-08T00:00:00.000Z");
    const fresh = keepFreshEntries(
      [
        {
          ticker: "NVDA",
          locale: "en",
          depth: "concise",
          personas: ["buffett", "thiel"],
          analysis,
          cachedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        },
        {
          ticker: "AAPL",
          locale: "en",
          depth: "concise",
          personas: ["buffett", "thiel"],
          analysis,
          cachedAt: new Date(now - LOCAL_ANALYSIS_TTL_MS - 1_000).toISOString(),
        },
      ],
      now,
    );
    expect(fresh.map((row) => row.ticker)).toEqual(["NVDA"]);
  });
});
