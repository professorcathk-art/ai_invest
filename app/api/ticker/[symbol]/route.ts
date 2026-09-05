import { NextResponse } from "next/server";
import { loadCompany } from "@/lib/data/load";
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
    return NextResponse.json({
      financials,
      sliders,
      dcf: bundle.dcf,
      lbo: bundle.lbo,
      vc: bundle.vc,
      personas: bundle.personas,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ticker error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
