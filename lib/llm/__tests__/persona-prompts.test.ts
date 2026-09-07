import { describe, expect, it } from "vitest";
import {
  INVESTOR_KNOWLEDGE_BASE,
  MENTAL_MODEL_FILTERS,
  type KnowledgePersonaId,
} from "@/lib/investor-knowledge-base";
import { personaSystemPrompt } from "@/lib/persona-prompts";
import { factPacket, icSystemPrompt } from "../prompts";
import type { CompanyContext } from "@/lib/data/context";
import type { EngineBundle } from "@/lib/engines/types";
import { PERSONA_IDS } from "../persona-ids";
import { PERSONA_LENSES } from "../lenses";

const IDS = Object.keys(INVESTOR_KNOWLEDGE_BASE) as KnowledgePersonaId[];

describe("investor knowledge base", () => {
  it("covers every IC seat with principles and quotes", () => {
    expect(IDS.sort()).toEqual([...PERSONA_IDS].sort());
    for (const id of IDS) {
      const kb = INVESTOR_KNOWLEDGE_BASE[id];
      expect(kb.core_principles.length).toBeGreaterThanOrEqual(3);
      expect(kb.iconic_quotes.length).toBeGreaterThanOrEqual(1);
      expect(MENTAL_MODEL_FILTERS[id].length).toBeGreaterThan(20);
    }
  });
});

describe("mental-model prompt engine", () => {
  it("injects wisdom and the seat-specific filter, without a segment mandate", () => {
    const musk = personaSystemPrompt("musk", "en", "concise");
    expect(musk).toContain("First Principles");
    expect(musk).toContain("Failure is an option here");
    expect(musk).toContain(MENTAL_MODEL_FILTERS.musk);
    expect(musk).not.toMatch(/MUST (name|cite|quote)/i);
    expect(musk).not.toMatch(/Gaming vs Cloud/i);

    const dalio = personaSystemPrompt("dalio", "zh", "professional");
    expect(dalio).toContain("macro credit cycles");
    expect(dalio).toContain("書面語");
    expect(dalio).toContain("嘅、係、唔、冇");

    const trump = personaSystemPrompt("trump", "en");
    expect(trump).toContain("tariffs, trade policy");
  });

  it("keeps the shared IC prompt as a fact-packet layer, not a citation checklist", () => {
    const shared = icSystemPrompt();
    expect(shared).toContain("RICH FACT PACKET");
    expect(shared).toContain("MENTAL MODEL FILTER");
    expect(shared).not.toMatch(/MUST name the specific lines/i);
    expect(shared).not.toMatch(/Gaming vs Cloud vs Advertising/i);
  });

  it("labels the user payload as a rich fact packet", () => {
    const bundle = {
      financials: {
        quote: {
          ticker: "TEST",
          name: "Test",
          exchange: "NASDAQ",
          price: 10,
          marketCap: 100,
          enterpriseValue: 110,
          pe: 12,
          evEbitda: 8,
          evRevenue: 2,
          beta: 1,
          sharesOutstanding: 10,
          currency: "USD",
          sector: "Software",
        },
        years: [],
        source: "fixture",
        warnings: [],
        defaults: { riskFreeRate: 0.04, equityRiskPremium: 0.05, costOfDebt: 0.06, taxRate: 0.21 },
      },
      sliders: { wacc: 0.09, terminalGrowth: 0.02, exitMultiple: 10, debtPct: 0.4 },
      dcf: {
        impliedPriceGordon: 12,
        impliedPriceExit: 11,
        upsideGordon: 0.2,
        upsideExit: 0.1,
        enterpriseValueGordon: 120,
        netDebt: 10,
      },
      lbo: {
        entryEv: 110,
        entryDebt: 44,
        entryEquity: 66,
        base: { irr: 0.18, moic: 2.1 },
        bull: { irr: 0.25 },
        bear: { irr: 0.08 },
      },
      vc: {
        yoyGrowth: 0.1,
        cagr3y: 0.12,
        fcfMargin: 0.08,
        ruleOf40: 18,
        ebitdaMargin: 0.2,
        grossMargin: 0.5,
        roic: 0.15,
        netDebtToEbitda: 1,
        evRevenue: 2,
        fcfConversion: 0.6,
      },
      personas: [],
    } as unknown as EngineBundle;
    const ctx: CompanyContext = {
      businessSummary: "Makes widgets.",
      news: [],
      highlights: [],
      references: [],
    };
    const packet = factPacket(bundle, ctx);
    expect(packet).toContain("RICH FACT PACKET");
    expect(packet).toContain("Makes widgets.");
    expect(packet).not.toMatch(/you MUST cite/i);
  });

  it("keeps lens cards aligned with the knowledge base", () => {
    expect(Object.keys(PERSONA_LENSES).sort()).toEqual(IDS.sort());
    expect(PERSONA_LENSES.buffett).toContain("moat");
    expect(PERSONA_LENSES.musk).toContain("First Principles");
  });
});
