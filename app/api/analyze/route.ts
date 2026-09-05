import { deepseek } from "@ai-sdk/deepseek";
import { streamObject } from "ai";
import { runEngines, type SliderAssumptions } from "@/lib/engines";
import type { CompanyFinancials } from "@/lib/engines/types";
import { writeAnalysis } from "@/lib/data/cache";
import { icAnalysisSchema } from "@/lib/llm/schemas";
import { icSystemPrompt, icUserPrompt } from "@/lib/llm/prompts";
import { fallbackAnalysis } from "@/lib/llm/personas";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    financials: CompanyFinancials;
    sliders: SliderAssumptions;
  };
  const bundle = runEngines(body.financials, body.sliders);
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    const fallback = fallbackAnalysis(bundle);
    await writeAnalysis({
      ticker: bundle.financials.quote.ticker,
      assumptions: bundle.sliders,
      engines: { dcf: bundle.dcf, lbo: bundle.lbo, vc: bundle.vc },
      personas: { scorecards: bundle.personas, analysis: fallback, provider: "fallback" },
    });
    return Response.json({ analysis: fallback, provider: "fallback", personas: bundle.personas });
  }

  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
  const result = streamObject({
    model: deepseek(model),
    schema: icAnalysisSchema,
    system: icSystemPrompt(),
    prompt: icUserPrompt(bundle),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const partial of result.partialObjectStream) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "partial", data: partial })}\n`));
        }
        const analysis = await result.object;
        await writeAnalysis({
          ticker: bundle.financials.quote.ticker,
          assumptions: bundle.sliders,
          engines: { dcf: bundle.dcf, lbo: bundle.lbo, vc: bundle.vc },
          personas: { scorecards: bundle.personas, analysis, provider: "deepseek" },
        });
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: "final", data: analysis, personas: bundle.personas, provider: "deepseek" })}\n`,
          ),
        );
      } catch (error) {
        const fallback = fallbackAnalysis(bundle);
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: "final",
              data: fallback,
              personas: bundle.personas,
              provider: "fallback",
              error: error instanceof Error ? error.message : "DeepSeek failed",
            })}\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
