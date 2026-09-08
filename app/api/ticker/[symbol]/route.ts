import { NextResponse } from "next/server";
import { loadCompany } from "@/lib/data/load";
import { fetchCompanyContext } from "@/lib/data/context";
import { buildBusinessBreakdown } from "@/lib/data/segments";
import { readLatestCachedAnalysis } from "@/lib/data/analysis-cache";
import { isUsableFinancials, isUsableValuation } from "@/lib/data/normalize";
import { defaultSliders, runEngines } from "@/lib/engines";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const lang = new URL(request.url).searchParams.get("lang") === "zh" ? "zh" : "en";
  try {
    const financials = await loadCompany(symbol);
    const sliders = defaultSliders(financials);
    const bundle = runEngines(financials, sliders);
    const booksReady = isUsableFinancials(financials);
    const valuationReady = isUsableValuation(financials, bundle.dcf);
    const [context, cachedAnalysis] = await Promise.all([
      fetchCompanyContext(financials.quote.ticker, lang).catch(() => ({
        businessSummary: "",
        news: [],
        highlights: [],
        references: [],
      })),
      readLatestCachedAnalysis(financials.quote.ticker, lang).catch(() => null),
    ]);
    const business = await buildBusinessBreakdown(financials.quote.ticker, context).catch(() => null);
    return NextResponse.json({
      financials,
      sliders,
      dcf: bundle.dcf,
      lbo: bundle.lbo,
      vc: bundle.vc,
      personas: bundle.personas,
      booksReady,
      valuationReady,
      context,
      business,
      cachedAnalysis,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ticker error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
