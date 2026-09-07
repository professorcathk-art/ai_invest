import { ingestAuthorized } from "@/lib/api/ingest-auth";
import { ownershipIngestStandard, parseIngestBody } from "@/lib/data/ownership";
import { upsertOwnership } from "@/lib/data/ownership-store";

export const runtime = "nodejs";

function rejectPayload(error: string) {
  return {
    ok: false,
    error,
    how_to_fix: "Compare your JSON to standard.example_ok_hk or standard.example_ok_us, then POST again. Do not invent names or percentages.",
    standard: ownershipIngestStandard(),
  };
}

/** Workbuddy can GET this route to learn the write contract before posting. */
export async function GET() {
  return Response.json({
    ok: true,
    message: "Ownership ingest accepts sourced CCASS / 13F rows only. POST with Bearer RESEARCH_INGEST_TOKEN.",
    standard: ownershipIngestStandard(),
  });
}

export async function POST(request: Request) {
  if (!process.env.RESEARCH_INGEST_TOKEN?.trim()) {
    return Response.json({ error: "RESEARCH_INGEST_TOKEN is not set." }, { status: 503 });
  }
  if (!ingestAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseIngestBody(body);
  if ("error" in parsed) {
    return Response.json(rejectPayload(parsed.error), { status: 400 });
  }

  const result = await upsertOwnership(parsed);
  if ("error" in result) {
    const rejected = /rejected:/i.test(result.error);
    return Response.json(rejectPayload(result.error), { status: rejected ? 400 : 503 });
  }
  return Response.json({
    ok: true,
    written: result.written,
    accepted: parsed.map((row) => ({
      ticker: row.ticker,
      as_of_date: row.as_of_date,
      market_type: row.market_type,
      signal_type: row.signal_type,
      named_parties: row.top_buyers.length + row.top_sellers.length,
    })),
  });
}
