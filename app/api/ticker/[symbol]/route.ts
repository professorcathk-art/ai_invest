import { NextResponse } from "next/server";
import { loadCompany } from "@/lib/data/load";
import { fetchCompanyContext } from "@/lib/data/context";
import { isUsableFinancials, isUsableValuation } from "@/lib/data/normalize";
import { defaultSliders, runEngines } from "@/lib/engines";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  try {
    const financials = await loadCompany(symbol);
    const sliders = defaultSliders(financials);
    const bundle = runEngines(financials, sliders);
    const booksReady = isUsableFinancials(financials);
    const valuationReady = isUsableValuation(financials, bundle.dcf);
    const context = await fetchCompanyContext(financials.quote.ticker).catch(() => ({
      businessSummary: "",
      news: [],
      highlights: [],
      references: [],
    }));
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ticker error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
