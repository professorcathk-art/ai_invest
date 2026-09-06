import { runEngines } from "@/lib/engines";
import { writeAnalysis } from "@/lib/data/cache";
import { fetchCompanyContext } from "@/lib/data/context";
import { generateDebate, generatePersonaNarrative, PERSONAS } from "@/lib/llm/generate";
import { readEnginePayload } from "@/lib/api/request";
import type { IcAnalysis } from "@/lib/llm/schemas";

export const maxDuration = 60;
export const runtime = "nodejs";

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

  const persist = async (analysis: IcAnalysis) => {
    try {
      await withBudget(
        writeAnalysis({
          ticker: bundle.financials.quote.ticker,
          assumptions: bundle.sliders,
          engines: { dcf: bundle.dcf, lbo: bundle.lbo, vc: bundle.vc },
          personas: { scorecards: bundle.personas, analysis, provider: "deepseek" },
        }),
        PERSIST_BUDGET_MS,
        "Supabase persist",
      );
    } catch {
      // Ignore cache failures.
    }
  };

  if (!process.env.DEEPSEEK_API_KEY) {
    return Response.json(
      { error: "DEEPSEEK_API_KEY is not set on the server.", analysis: null },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };
      try {
        const ctx = await fetchCompanyContext(bundle.financials.quote.ticker);
        send({ type: "context", context: ctx });

        const results = await withBudget(
          Promise.allSettled(
            PERSONAS.map(async (persona) => {
              const narrative = await generatePersonaNarrative(persona.id, bundle, ctx, parsed.locale);
              send({ type: "persona", narrative });
              return narrative;
            }),
          ),
          DEEPSEEK_BUDGET_MS,
          "DeepSeek personas",
        );

        const narratives = PERSONAS.map((p) => {
          const hit = results.find(
            (r) => r.status === "fulfilled" && r.value.id === p.id,
          );
          return hit && hit.status === "fulfilled" ? hit.value : null;
        }).filter((n): n is NonNullable<typeof n> => Boolean(n));

        if (narratives.length < 4) {
          const reasons = results
            .filter((r): r is PromiseRejectedResult => r.status === "rejected")
            .map((r) => (r.reason instanceof Error ? r.reason.message : "failed"));
          send({
            type: "error",
            error: `DeepSeek persona generation failed (${narratives.length}/4). ${reasons[0] ?? ""}`,
          });
          return;
        }

        let debatePart: Pick<IcAnalysis, "debate" | "chairSummary">;
        try {
          debatePart = await generateDebate(narratives, bundle, ctx, parsed.locale);
        } catch {
          debatePart = {
            debate: [],
            chairSummary:
              parsed.locale === "zh"
                ? "四份备忘录已完成，书记辩论超时。如需完整辩论记录，请再运行一次投委会分析。"
                : "Chair debate timed out after the four persona memos were written. Re-run IC if you need the argument transcript.",
          };
        }
        const analysis = {
          narratives,
          debate: debatePart.debate,
          chairSummary: debatePart.chairSummary,
        } satisfies IcAnalysis;
        await persist(analysis);
        send({ type: "complete", analysis, provider: "deepseek" });
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : "DeepSeek IC generation failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
