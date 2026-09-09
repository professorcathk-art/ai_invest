import { ingestAuthorized } from "@/lib/api/ingest-auth";
import { fmpStable } from "@/lib/data/fmp-client";
import { collectDealHeadlines } from "@/lib/data/private-deals-rss";
import { replacePrivateDeals } from "@/lib/data/private-deals-store";
import { keepDisplayDeals, parsePrivateDeals } from "@/lib/data/private-market";
import { digestDealTape } from "@/lib/llm/private-deals";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return Response.json({
    ok: true,
    message: "POST with Bearer RESEARCH_INGEST_TOKEN to digest M&A headlines into private_deals.",
  });
}

export async function POST(request: Request) {
  if (!process.env.RESEARCH_INGEST_TOKEN?.trim()) {
    return Response.json({ error: "RESEARCH_INGEST_TOKEN is not set." }, { status: 503 });
  }
  if (!ingestAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [stable, headlines] = await Promise.all([
    fmpStable("/mergers-acquisitions-latest?page=0"),
    collectDealHeadlines("en"),
  ]);
  const fmp = parsePrivateDeals(stable);
  const deals = keepDisplayDeals(await digestDealTape(headlines, fmp));
  const result = await replacePrivateDeals(deals);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 503 });
  }
  return Response.json({
    ok: true,
    headlines: headlines.length,
    written: result.written,
    deals: deals.slice(0, 8).map((row) => ({
      target: row.target,
      acquirer: row.acquirer,
      sources: row.sources.length,
    })),
  });
}
