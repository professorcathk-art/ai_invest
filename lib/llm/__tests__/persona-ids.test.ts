import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONA_IDS,
  normalizeSelectedPersonas,
  personasKey,
} from "../persona-ids";
import { hashAssumptions, hashPersonas } from "@/lib/data/analysis-cache";
import { classifyHeadline } from "@/lib/data/industry-sectors";
import { parseSegmentPayload } from "@/lib/data/segments";
import { parsePrivateDeals } from "@/lib/data/private-market";

describe("selected personas", () => {
  it("keeps catalog order and falls back to the original four", () => {
    expect(normalizeSelectedPersonas(["musk", "trump", "buffett"])).toEqual([
      "buffett",
      "trump",
      "musk",
    ]);
    expect(normalizeSelectedPersonas(["trump"])).toEqual([...DEFAULT_PERSONA_IDS]);
    expect(normalizeSelectedPersonas(undefined)).toEqual([...DEFAULT_PERSONA_IDS]);
  });

  it("hashes personas and sliders stably", () => {
    expect(personasKey(["musk", "buffett"])).toBe("buffett,musk");
    expect(hashPersonas(["musk", "buffett"])).toBe(hashPersonas(["buffett", "musk"]));
    const sliders = { wacc: 0.09, terminalGrowth: 0.025, exitMultiple: 12, debtPct: 0.5 };
    expect(hashAssumptions(sliders, "en")).not.toBe(hashAssumptions(sliders, "zh"));
    expect(hashAssumptions(sliders, "en")).toBe(hashAssumptions({ ...sliders, wacc: 0.0904 }, "en"));
  });
});

describe("sourced dashboards", () => {
  it("parses nested FMP product maps and ignores empty payloads", () => {
    const parsed = parseSegmentPayload([
      {
        AAPL: [
          {
            "2024-09-28": { iPhone: 200, Services: 80, Mac: 20 },
          },
        ],
      },
    ]);
    expect(parsed.slices[0]?.name).toBe("iPhone");
    expect(parsed.slices.reduce((s, row) => s + row.share, 0)).toBeCloseTo(1, 8);
    expect(parseSegmentPayload(null).slices).toEqual([]);
  });

  it("does not invent private deals from empty feeds", () => {
    expect(parsePrivateDeals(null)).toEqual([]);
    expect(parsePrivateDeals([{ companyName: "" }])).toEqual([]);
    expect(parsePrivateDeals([{ targetedCompanyName: "Acme", companyName: "Buyer", transactionValue: 2e9 }])[0]?.target).toBe(
      "Acme",
    );
  });

  it("tags tariff headlines as at-risk without inventing a quote", () => {
    const hit = classifyHeadline("Trump tariff probe hits EV exporters", "en");
    expect(hit.impact).toBe("at_risk");
    expect(hit.lens).toMatch(/trade|tariff/i);
    expect(hit.lens).not.toMatch(/I would|greatest deal/i);
  });
});
