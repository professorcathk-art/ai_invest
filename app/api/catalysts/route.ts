import { fetchCompanyContext } from "@/lib/data/context";
import { fetchLiveDividendPack, finalizeCatalystPack } from "@/lib/data/catalysts";
import { synthesizeCatalysts } from "@/lib/llm/insights";
import { normalizeSymbol } from "@/lib/data/normalize";

export const maxDuration = 20;
export const runtime = "nodejs";

function withBudget<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`catalysts exceeded ${ms}ms`)), ms);
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = normalizeSymbol(url.searchParams.get("ticker") ?? "");
  if (!ticker) {
    return Response.json({ error: "ticker is required." }, { status: 400 });
  }
  const locale = url.searchParams.get("lang") === "zh" ? "zh" : "en";
  const synthesize = url.searchParams.get("synthesize") !== "0";

  try {
    const [live, ctx] = await Promise.all([
      fetchLiveDividendPack(ticker),
      fetchCompanyContext(ticker, locale).catch(() => ({
        businessSummary: "",
        news: [],
        highlights: [],
        references: [],
      })),
    ]);

    let catalysts = [] as Awaited<ReturnType<typeof synthesizeCatalysts>>;
    let synthesized = false;
    if (synthesize) {
      try {
        catalysts = await withBudget(
          synthesizeCatalysts({
            ticker,
            name: live.name,
            locale,
            news: ctx.news,
            dividend: live.dividend,
            earningsDate: live.earningsDate,
          }),
          12_000,
        );
        synthesized = Boolean(process.env.DEEPSEEK_API_KEY);
      } catch {
        catalysts = [];
      }
    }

    const pack = finalizeCatalystPack({
      ticker,
      name: live.name,
      currency: live.currency,
      source: live.live ? "live" : "fallback",
      synthesized,
      dividend: live.dividend,
      history: live.history,
      catalysts,
      locale,
    });

    return Response.json(pack, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Catalyst fetch failed." },
      { status: 500 },
    );
  }
}
