import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { z } from "zod";
import type { RssItem } from "@/lib/data/rss";
import { mergeSources, sourceLabel } from "@/lib/data/deal-sources";
import {
  cleanCompanyName,
  formatDealSize,
  isUsableCompanyName,
  inferDealSector,
  extractRaiseSize,
  extractValuation,
  mergeDealRows,
  type PrivateDeal,
} from "@/lib/data/private-market";
import { dealFromHeadline } from "@/lib/data/private-deals-rss";

const digestSchema = z.object({
  deals: z.array(
    z.object({
      target: z.string(),
      acquirer: z.string().optional().default(""),
      sector: z.string().optional().default(""),
      dealType: z.string().optional().default(""),
      dealSize: z.string().optional().default(""),
      valuation: z.string().optional().default(""),
      leadInvestors: z.string().optional().default(""),
      announcedOn: z.string().nullable().optional(),
      sourceIndexes: z.array(z.number().int()).min(1).max(8),
    }),
  ),
});

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

function fallbackDeals(headlines: RssItem[]): PrivateDeal[] {
  return headlines.map(dealFromHeadline).filter((row): row is PrivateDeal => row != null);
}

export async function digestDealTape(headlines: RssItem[], structured: PrivateDeal[] = []): Promise<PrivateDeal[]> {
  if (!headlines.length) return structured;
  if (!process.env.DEEPSEEK_API_KEY) return mergeDealRows([...structured, ...fallbackDeals(headlines)]);

  const { text } = await generateText({
    model: deepseek(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"),
    system: `You extract private-market / M&A deals from headlines.
HARD RULES:
- target MUST be a short company name only — never the full headline, never a person (Peter Thiel), never "Exclusive", never a truncated phrase like "French A.I. Start", never an appositive like "Clay, an A.I. Sales Tool Provider".
- The same transaction mentioned by several headlines is ONE deal. Put every matching headline index in sourceIndexes.
- Read title AND snippet. Infer sector even when the headline does not say "Fintech" / "Biotech". Allowed sectors: Artificial Intelligence, Biotech, Financials, Enterprise Software, Semiconductors, Electric Vehicles, Consumer, Energy, Telecom, Defense, Crypto, Industrials, Infrastructure.
- acquirer, leadInvestors, dealSize, valuation: copy from the text or leave "". Never invent a buyer, advisor, or dollar amount.
- dealSize is capital raised (e.g. "raises $50M"). valuation is post-money (e.g. "at a $400M valuation"). Never swap them. Ignore share prices.
- dealType is Funding, Venture round, YC launch, M&A, or Merger.
- announcedOn is YYYY-MM-DD when the headline date is known, else null.
Return ONLY JSON: { "deals": [{ "target":"Cognition","acquirer":"","sector":"Artificial Intelligence","dealType":"Funding","dealSize":"$2B","valuation":"$10B","leadInvestors":"","announcedOn":"2026-09-08","sourceIndexes":[0,3] }] }`,
    prompt: JSON.stringify(
      {
        headlines: headlines.map((item, index) => ({
          i: index,
          title: item.title,
          snippet: (item.summary ?? "").slice(0, 400),
          publisher: item.publisher,
          url: item.url,
          publishedAt: item.publishedAt,
        })),
      },
      null,
      2,
    ),
    maxRetries: 0,
    maxOutputTokens: 1200,
    temperature: 0.1,
    providerOptions: {
      deepseek: { thinking: { type: "disabled" } },
    },
  });

  try {
    const parsed = digestSchema.parse(extractJson(text));
    const digested: PrivateDeal[] = [];
    for (const row of parsed.deals) {
      const target = cleanCompanyName(row.target);
      if (!isUsableCompanyName(target)) continue;
      const picked = row.sourceIndexes
        .map((index) => headlines[index])
        .filter((item): item is RssItem => Boolean(item));
      if (!picked.length) continue;
      const blob = picked.map((item) => `${item.title} ${item.summary ?? ""}`).join(" ");
      digested.push({
        id: `digest-${target}-${row.announcedOn ?? picked[0]?.publishedAt ?? ""}`,
        announcedOn: row.announcedOn ?? picked[0]?.publishedAt ?? null,
        target,
        acquirer: cleanCompanyName(row.acquirer),
        sector: inferDealSector(row.sector.trim(), target, row.acquirer, blob),
        dealType: row.dealType.trim() || "M&A",
        dealSize: formatDealSize(row.dealSize) || extractRaiseSize(blob),
        valuation: formatDealSize(row.valuation) || extractValuation(blob),
        leadInvestors: row.leadInvestors.trim(),
        sources: mergeSources(
          picked.map((item) => ({ label: sourceLabel(item.url, item.publisher, item.title), url: item.url })),
        ),
      });
    }
    return mergeDealRows([...structured, ...digested, ...fallbackDeals(headlines)]);
  } catch {
    return mergeDealRows([...structured, ...fallbackDeals(headlines)]);
  }
}
