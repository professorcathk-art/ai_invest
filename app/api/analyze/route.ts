import { deepseek } from "@ai-sdk/deepseek";
import { generateObject } from "ai";
import { runEngines } from "@/lib/engines";
import { writeAnalysis } from "@/lib/data/cache";
import { icAnalysisSchema } from "@/lib/llm/schemas";
import { icSystemPrompt, icUserPrompt } from "@/lib/llm/prompts";
import { fallbackAnalysis } from "@/lib/llm/personas";
import { readEnginePayload } from "@/lib/api/request";

export const maxDuration = 30;
export const runtime = "nodejs";

const DEEPSEEK_BUDGET_MS = 18_000;

export async function POST(request: Request) {
  const parsed = await readEnginePayload(request);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  const bundle = runEngines(parsed.financials, parsed.sliders);
  const fallback = fallbackAnalysis(bundle);
  const apiKey = process.env.DEEPSEEK_API_KEY;

  const persist = (analysis: typeof fallback, provider: "deepseek" | "fallback") =>
    writeAnalysis({
      ticker: bundle.financials.quote.ticker,
      assumptions: bundle.sliders,
      engines: { dcf: bundle.dcf, lbo: bundle.lbo, vc: bundle.vc },
      personas: { scorecards: bundle.personas, analysis, provider },
    });

  if (!apiKey) {
    await persist(fallback, "fallback");
    return Response.json({
      analysis: fallback,
      provider: "fallback",
      personas: bundle.personas,
    });
  }

  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  try {
    const { object } = await generateObject({
      model: deepseek(model),
      schema: icAnalysisSchema,
      system: icSystemPrompt(),
      prompt: icUserPrompt(bundle),
      maxRetries: 0,
      maxOutputTokens: 1800,
      abortSignal: AbortSignal.timeout(DEEPSEEK_BUDGET_MS),
      providerOptions: {
        deepseek: {
          thinking: { type: "disabled" },
        },
      },
    });
    await persist(object, "deepseek");
    return Response.json({
      analysis: object,
      provider: "deepseek",
      personas: bundle.personas,
    });
  } catch (error) {
    await persist(fallback, "fallback");
    return Response.json({
      analysis: fallback,
      provider: "fallback",
      personas: bundle.personas,
      error: error instanceof Error ? error.message : "DeepSeek timed out",
    });
  }
}
