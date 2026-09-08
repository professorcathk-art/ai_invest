import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONA_IDS,
  normalizeSelectedPersonas,
  personasKey,
} from "../persona-ids";
import { hashAssumptions, hashPersonas } from "@/lib/data/analysis-cache";
import { classifyHeadline } from "@/lib/data/industry-sectors";
import { parseSegmentPayload } from "@/lib/data/segments";
import { fmpStatementYear } from "@/lib/data/fmp";
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

  it("reads the FMP stable { data: { Product: number } } map", () => {
    const parsed = parseSegmentPayload([
      {
        date: "2025-01-26",
        fiscalYear: 2025,
        data: { Gaming: 11_300_000_000, "Data Center": 115_200_000_000, Automotive: 1_700_000_000 },
      },
    ]);
    expect(parsed.slices[0]?.name).toBe("Data Center");
    expect(parsed.slices).toHaveLength(3);
    expect(parsed.period).toBe("2025-01-26");
  });

  it("does not invent private deals from empty feeds", () => {
    expect(parsePrivateDeals(null)).toEqual([]);
    expect(parsePrivateDeals([{ companyName: "" }])).toEqual([]);
    expect(parsePrivateDeals([{ targetedCompanyName: "Acme", companyName: "Buyer", transactionValue: 2e9 }])[0]?.target).toBe(
      "Acme",
    );
  });

  it("reads fiscalYear or the statement date when calendarYear is missing", () => {
    expect(fmpStatementYear({ fiscalYear: "2025", date: "2025-01-26" })).toBe(2025);
    expect(fmpStatementYear({ date: "2024-01-28" })).toBe(2024);
    expect(fmpStatementYear({ calendarYear: 0, date: "2023-01-29" })).toBe(2023);
  });

  it("tags tariff headlines as at-risk without inventing a quote", () => {
    const hit = classifyHeadline("Trump tariff probe hits EV exporters", "en");
    expect(hit.impact).toBe("at_risk");
    expect(hit.lens).toMatch(/trade|tariff/i);
    expect(hit.lens).not.toMatch(/I would|greatest deal/i);
  });
});
