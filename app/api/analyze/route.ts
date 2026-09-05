import { deepseek } from "@ai-sdk/deepseek";
import { generateObject } from "ai";
import { runEngines } from "@/lib/engines";
import { writeAnalysis } from "@/lib/data/cache";
import { icAnalysisSchema } from "@/lib/llm/schemas";
import { icSystemPrompt, icUserPrompt } from "@/lib/llm/prompts";
import { fallbackAnalysis } from "@/lib/llm/personas";
import { readEnginePayload } from "@/lib/api/request";
import type { IcAnalysis } from "@/lib/llm/schemas";

export const maxDuration = 60;
export const runtime = "nodejs";

/** Leave headroom so Vercel never kills the invocation (plan cap is 60s). */
const DEEPSEEK_BUDGET_MS = 50_000;
const PERSIST_BUDGET_MS = 2_000;

function withBudget<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function POST(request: Request) {
  const parsed = await readEnginePayload(request);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  const bundle = runEngines(parsed.financials, parsed.sliders);
  const fallback = fallbackAnalysis(bundle);

  const persist = async (analysis: IcAnalysis, provider: "deepseek" | "fallback") => {
    try {
      await withBudget(
        writeAnalysis({
          ticker: bundle.financials.quote.ticker,
          assumptions: bundle.sliders,
          engines: { dcf: bundle.dcf, lbo: bundle.lbo, vc: bundle.vc },
          personas: { scorecards: bundle.personas, analysis, provider },
        }),
        PERSIST_BUDGET_MS,
        "Supabase persist",
      );
    } catch {
      // Never fail the IC response because cache write stalled.
    }
  };

  const apiKey = process.env.DEEPSEEK_API_KEY;
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
    const { object } = await withBudget(
      generateObject({
        model: deepseek(model),
        schema: icAnalysisSchema,
        system: icSystemPrompt(),
        prompt: icUserPrompt(bundle),
        maxRetries: 0,
        maxOutputTokens: 5000,
        abortSignal: AbortSignal.timeout(DEEPSEEK_BUDGET_MS),
        providerOptions: {
          deepseek: {
            thinking: { type: "disabled" },
          },
        },
      }),
      DEEPSEEK_BUDGET_MS,
      "DeepSeek",
    );
    await persist(object, "deepseek");
    return Response.json({
      analysis: object,
      provider: "deepseek",
      personas: bundle.personas,
    });
  } catch {
    await persist(fallback, "fallback");
    return Response.json({
      analysis: fallback,
      provider: "fallback",
      personas: bundle.personas,
    });
  }
}
