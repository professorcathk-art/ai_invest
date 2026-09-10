import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { z } from "zod";
import { languageRule } from "./prompts";
import type { Locale } from "@/lib/i18n/messages";
import {
  parseNameCalls,
  sectorSpec,
  type IndustrySectorId,
  type SectorHeadline,
  type SectorNameCall,
} from "@/lib/data/industry-sectors";

const deskSchema = z.object({
  brief: z.array(z.string().min(1)).max(5),
  beneficiaries: z.array(z.object({ ticker: z.string(), reason: z.string() })).max(6),
  atRisk: z.array(z.object({ ticker: z.string(), reason: z.string() })).max(6),
});

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function generateSectorDeskNote(input: {
  sector: IndustrySectorId;
  locale: Locale;
  date: string;
  weekEnd?: string;
  headlines: SectorHeadline[];
  watchlist: string[];
}): Promise<{ brief: string[]; beneficiaries: SectorNameCall[]; atRisk: SectorNameCall[] }> {
  const empty = { brief: [] as string[], beneficiaries: [] as SectorNameCall[], atRisk: [] as SectorNameCall[] };
  if (!input.headlines.length || !process.env.DEEPSEEK_API_KEY) return empty;

  const weekEnd = input.weekEnd ?? input.date;
  const run = async () =>
    generateText({
      model: deepseek(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"),
      system: `You are the InvestMouse investment committee desk. Read ONE Hong Kong calendar week of tape (Monday ${input.date} through Sunday ${weekEnd}) through Buffett, Dalio, Thiel, and PE lenses.
HARD RULES:
- Use ONLY the supplied headlines. Never invent a story, price, or vote.
- Headlines often omit ticker names. Infer which WATCHLIST names are helped or hurt and explain the linkage (export controls → NVDA/TSM/0981.HK; oil shock → COST as a staple; GLP-1/FDA → LLY/NVO).
- beneficiaries and atRisk tickers MUST be in the watchlist. The name does not have to appear in the headline.
- When the week's tape is non-empty, ALWAYS fill 2–4 beneficiaries AND 1–3 atRisk names with a one-line reason. Do not leave both lists empty.
- Tickers: US names like NVDA; Hong Kong names keep the .HK suffix (0981.HK, 0700.HK).
- This is a committee reading of the tape, not a formal IC vote on a single stock.
- ${languageRule(input.locale)}
- Never mix languages. English locale = English only. Chinese locale = Traditional Chinese 書面語 only.
Return ONLY JSON: { "brief": ["..."], "beneficiaries": [{"ticker":"NVDA","reason":"..."}], "atRisk": [{"ticker":"AMD","reason":"..."}] }`,
      prompt: JSON.stringify(
        {
          sector: input.sector,
          weekStart: input.date,
          weekEnd,
          watchlist: input.watchlist,
          headlines: input.headlines.map((item) => ({
            title: item.title,
            publisher: item.publisher,
            publishedAt: item.publishedAt,
            mentioned: item.tickers,
          })),
        },
        null,
        2,
      ),
      maxRetries: 0,
      maxOutputTokens: 1200,
      temperature: 0.2,
      providerOptions: {
        deepseek: { thinking: { type: "disabled" } },
      },
    });

  const parse = (text: string) => {
    const parsed = deskSchema.parse(extractJson(text));
    const spec = sectorSpec(input.sector);
    const aliases = spec.aliases as Record<string, readonly string[]>;
    return {
      brief: parsed.brief.map((item) => item.trim()).filter(Boolean).slice(0, 4),
      beneficiaries: parseNameCalls(parsed.beneficiaries, spec.tickers, aliases),
      atRisk: parseNameCalls(parsed.atRisk, spec.tickers, aliases),
    };
  };

  try {
    const first = parse((await run()).text);
    if (first.brief.length || first.beneficiaries.length || first.atRisk.length) return first;
    return parse((await run()).text);
  } catch {
    return empty;
  }
}
