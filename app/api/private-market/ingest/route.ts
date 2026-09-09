import { ingestAuthorized } from "@/lib/api/ingest-auth";
import { fmpStable } from "@/lib/data/fmp-client";
import { collectDealHeadlines } from "@/lib/data/private-deals-rss";
import { replacePrivateDeals } from "@/lib/data/private-deals-store";
import { keepDisplayDeals, parsePrivateDeals } from "@/lib/data/private-market";
import type { RssItem } from "@/lib/data/rss";
import { digestDealTape } from "@/lib/llm/private-deals";

export const runtime = "nodejs";
export const maxDuration = 60;

function extraHeadlines(raw: unknown): RssItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RssItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const title = String(rec.title ?? "").trim();
    const url = String(rec.url ?? rec.link ?? "").trim();
    if (!title) continue;
    out.push({
      title,
      publisher: String(rec.publisher ?? "Wire").trim() || "Wire",
      url,
      publishedAt: rec.publishedAt ? String(rec.publishedAt) : null,
    });
  }
  return out.slice(0, 40);
}

export async function GET() {
  return Response.json({
    ok: true,
    message: "POST with Bearer RESEARCH_INGEST_TOKEN to digest M&A / VC headlines into private_deals.",
    body: {
      headlines: [{ title: "Acme raises $40M at a $200M valuation", url: "https://example.com", publisher: "a16z" }],
      deals: [{ target: "Acme", leadInvestors: "Y Combinator", dealType: "YC launch" }],
    },
  });
}

export async function POST(request: Request) {
  if (!process.env.RESEARCH_INGEST_TOKEN?.trim()) {
    return Response.json({ error: "RESEARCH_INGEST_TOKEN is not set." }, { status: 503 });
  }
  if (!ingestAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let extras: RssItem[] = [];
  let extraDeals: ReturnType<typeof parsePrivateDeals> = [];
  try {
    const body = (await request.json()) as Record<string, unknown>;
    extras = extraHeadlines(body.headlines);
    extraDeals = parsePrivateDeals(body.deals);
  } catch {
    extras = [];
  }

  const [stable, headlines] = await Promise.all([
    fmpStable("/mergers-acquisitions-latest?page=0"),
    collectDealHeadlines("en"),
  ]);
  const fmp = parsePrivateDeals(stable);
  const deals = keepDisplayDeals(await digestDealTape([...headlines, ...extras], [...fmp, ...extraDeals]));
  const result = await replacePrivateDeals(deals);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 503 });
  }
  return Response.json({
    ok: true,
    headlines: headlines.length + extras.length,
    extras: extras.length,
    written: result.written,
    deals: deals.slice(0, 8).map((row) => ({
      target: row.target,
      acquirer: row.acquirer,
      dealSize: row.dealSize,
      valuation: row.valuation,
      sources: row.sources.length,
    })),
  });
}
