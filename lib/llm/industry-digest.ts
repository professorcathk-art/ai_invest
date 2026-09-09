import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { z } from "zod";
import { languageRule } from "./prompts";
import type { Locale } from "@/lib/i18n/messages";
import {
  parseNameCalls,
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
  headlines: SectorHeadline[];
  watchlist: string[];
}): Promise<{ brief: string[]; beneficiaries: SectorNameCall[]; atRisk: SectorNameCall[] }> {
  const empty = { brief: [] as string[], beneficiaries: [] as SectorNameCall[], atRisk: [] as SectorNameCall[] };
  if (!input.headlines.length || !process.env.DEEPSEEK_API_KEY) return empty;

  const { text } = await generateText({
    model: deepseek(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"),
    system: `You are the InvestMouse sector desk. Read the day's tape through Buffett, Dalio, Thiel, and PE lenses in ONE note.
HARD RULES:
- Use ONLY the supplied headlines. Never invent a story, price, or vote.
- beneficiaries and atRisk tickers MUST be in the watchlist AND supported by at least one headline.
- If the tape does not clearly help or hurt a name, leave that list empty.
- This is a news digest, not an Investment Committee vote.
- ${languageRule(input.locale)}
Return ONLY JSON: { "brief": ["..."], "beneficiaries": [{"ticker":"NVDA","reason":"..."}], "atRisk": [{"ticker":"AMD","reason":"..."}] }`,
    prompt: JSON.stringify(
      {
        sector: input.sector,
        date: input.date,
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
    maxOutputTokens: 700,
    temperature: 0.2,
    providerOptions: {
      deepseek: { thinking: { type: "disabled" } },
    },
  });

  try {
    const parsed = deskSchema.parse(extractJson(text));
    return {
      brief: parsed.brief.map((item) => item.trim()).filter(Boolean).slice(0, 4),
      beneficiaries: parseNameCalls(parsed.beneficiaries, input.watchlist),
      atRisk: parseNameCalls(parsed.atRisk, input.watchlist),
    };
  } catch {
    return empty;
  }
}
