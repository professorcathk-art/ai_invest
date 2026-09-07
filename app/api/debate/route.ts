import { runEngines } from "@/lib/engines";
import { fetchCompanyContext } from "@/lib/data/context";
import { listOwnership } from "@/lib/data/ownership-store";
import { ownershipLlmBrief } from "@/lib/data/ownership";
import { generateDebate } from "@/lib/llm/generate";
import { debateMode, fallbackDebate, votingResults } from "@/lib/llm/debate";
import { personaNarrativeSchema, type IcAnalysis } from "@/lib/llm/schemas";
import { readEnginePayload } from "@/lib/api/request";
import { z } from "zod";

export const maxDuration = 30;
export const runtime = "nodejs";

const narrativesSchema = z.array(personaNarrativeSchema).length(4);

export async function POST(request: Request) {
  const parsed = await readEnginePayload(request);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }

  let narratives: IcAnalysis["narratives"];
  try {
    narratives = narrativesSchema.parse(parsed.narratives);
  } catch {
    return Response.json({ error: "Four persona narratives are required." }, { status: 400 });
  }

  const bundle = runEngines(parsed.financials, parsed.sliders);
  const ticker = bundle.financials.quote.ticker;
  const [ctx, snapshots] = await Promise.all([
    fetchCompanyContext(ticker, parsed.locale),
    listOwnership(ticker, 30).catch(() => []),
  ]);
  ctx.ownershipBrief = ownershipLlmBrief(snapshots);

  const votes = votingResults(narratives);
  const mode = debateMode(votes);

  if (!process.env.DEEPSEEK_API_KEY) {
    const fallback = fallbackDebate(narratives, parsed.locale);
    return Response.json({ debate: fallback.debate, chairSummary: fallback.chairSummary, mode, provider: "fallback" });
  }

  try {
    const part = await generateDebate(narratives, bundle, ctx, parsed.locale, parsed.depth);
    return Response.json({ ...part, mode, provider: "deepseek" });
  } catch {
    const fallback = fallbackDebate(narratives, parsed.locale);
    return Response.json({ ...fallback, mode, provider: "fallback" });
  }
}
