import { runEngines } from "@/lib/engines";
import { writeAnalysis } from "@/lib/data/cache";
import { readCachedAnalysis, writeCachedAnalysis } from "@/lib/data/analysis-cache";
import { fetchCompanyContext } from "@/lib/data/context";
import { buildBusinessBreakdown, segmentBrief } from "@/lib/data/segments";
import { refreshThenListOwnership } from "@/lib/data/ownership-live";
import { ownershipLlmBrief, preferredOwnershipMarket } from "@/lib/data/ownership";
import { generateDebate, generatePersonaNarrative, personasFor } from "@/lib/llm/generate";
import { fallbackDebate } from "@/lib/llm/debate";
import { fallbackSmartMoneyInsight, generateSmartMoneyInsight } from "@/lib/llm/insights";
import { readEnginePayload } from "@/lib/api/request";
import type { IcAnalysis } from "@/lib/llm/schemas";

export const maxDuration = 60;
export const runtime = "nodejs";

const PERSONA_BUDGET_MS = 36_000;
const DEBATE_BUDGET_MS = 16_000;
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
  const selected = parsed.selectedPersonas;
  const roster = personasFor(selected);

  const persist = async (analysis: IcAnalysis) => {
    try {
      await withBudget(
        Promise.all([
          writeAnalysis({
            ticker: bundle.financials.quote.ticker,
            assumptions: bundle.sliders,
            engines: { dcf: bundle.dcf, lbo: bundle.lbo, vc: bundle.vc },
            personas: { scorecards: bundle.personas, analysis, provider: "deepseek" },
          }),
          writeCachedAnalysis({
            ticker: bundle.financials.quote.ticker,
            mode: parsed.depth,
            personas: selected,
            sliders: bundle.sliders,
            locale: parsed.locale,
            analysis,
          }),
        ]),
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
        const ticker = bundle.financials.quote.ticker;
        const cached = await readCachedAnalysis({
          ticker,
          mode: parsed.depth,
          personas: selected,
          sliders: bundle.sliders,
          locale: parsed.locale,
        });

        const [ctx, snapshots] = await Promise.all([
          fetchCompanyContext(ticker, parsed.locale),
          refreshThenListOwnership(ticker, 30).catch(() => []),
        ]);
        ctx.ownershipBrief = ownershipLlmBrief(snapshots);
        const breakdown = await buildBusinessBreakdown(ticker, ctx).catch(() => null);
        if (breakdown) ctx.segmentBrief = segmentBrief(breakdown, parsed.locale);
        send({
          type: "context",
          context: ctx,
          business: breakdown,
          snapshots,
          ownershipMarket: preferredOwnershipMarket(snapshots, ticker),
        });

        if (cached) {
          send({
            type: "cached",
            analysis: cached.analysis,
            cachedAt: cached.cachedAt,
            fromCache: true,
          });
          send({
            type: "complete",
            analysis: cached.analysis,
            provider: "cache",
            fromCache: true,
            cachedAt: cached.cachedAt,
          });
          return;
        }

        const insightTask = withBudget(
          generateSmartMoneyInsight(snapshots, parsed.locale),
          10_000,
          "Smart money insight",
        )
          .catch(() => fallbackSmartMoneyInsight(snapshots, parsed.locale))
          .then((insight) => {
            send({ type: "smartMoney", smartMoneyInsight: insight });
            return insight;
          });

        const started = Date.now();
        const results = await withBudget(
          Promise.allSettled(
            roster.map(async (persona) => {
              const narrative = await generatePersonaNarrative(
                persona.id,
                bundle,
                ctx,
                parsed.locale,
                parsed.depth,
              );
              send({ type: "persona", narrative });
              return narrative;
            }),
          ),
          PERSONA_BUDGET_MS,
          "DeepSeek personas",
        );

        const narratives = roster
          .map((p) => {
            const hit = results.find((r) => r.status === "fulfilled" && r.value.id === p.id);
            return hit && hit.status === "fulfilled" ? hit.value : null;
          })
          .filter((n): n is NonNullable<typeof n> => Boolean(n));

        if (narratives.length < roster.length) {
          const reasons = results
            .filter((r): r is PromiseRejectedResult => r.status === "rejected")
            .map((r) => (r.reason instanceof Error ? r.reason.message : "failed"));
          await insightTask.catch(() => null);
          send({
            type: "error",
            error: `DeepSeek persona generation failed (${narratives.length}/${roster.length}). ${reasons[0] ?? ""}`,
          });
          return;
        }

        let debatePart: Pick<IcAnalysis, "debate" | "chairSummary">;
        const leftover = Math.max(
          10_000,
          DEBATE_BUDGET_MS - Math.max(0, Date.now() - started - PERSONA_BUDGET_MS),
        );
        try {
          debatePart = await withBudget(
            generateDebate(
              narratives,
              bundle,
              ctx,
              parsed.locale,
              leftover < 16_000 ? "concise" : parsed.depth,
            ),
            leftover,
            "DeepSeek debate",
          );
        } catch {
          debatePart = fallbackDebate(narratives, parsed.locale);
        }
        const smartMoneyInsight = await insightTask;
        const analysis = {
          narratives,
          debate: debatePart.debate,
          chairSummary: debatePart.chairSummary,
          smartMoneyInsight,
        } satisfies IcAnalysis;
        await persist(analysis);
        send({ type: "complete", analysis, provider: "deepseek", fromCache: false });
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
