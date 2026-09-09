import { ingestAuthorized } from "@/lib/api/ingest-auth";
import { parseShortSellingSources, shortSellingIngestStandard } from "@/lib/data/hkex-short-selling";
import { upsertShortSelling } from "@/lib/data/hkex-short-selling-store";

export const runtime = "nodejs";

function rejectPayload(error: string) {
  return {
    ok: false,
    error,
    how_to_fix:
      "POST the official ASHT/MSHT <pre> text after the close. Do not invent shares, turnover, or a trading date.",
    standard: shortSellingIngestStandard(),
  };
}

export async function GET() {
  return Response.json({
    ok: true,
    message: "HKEX short-selling ingest accepts sourced ASHT/MSHT tables only. POST with Bearer RESEARCH_INGEST_TOKEN.",
    standard: shortSellingIngestStandard(),
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

  const parsed = parseShortSellingSources(body);
  if ("error" in parsed) {
    return Response.json(rejectPayload(parsed.error), { status: 400 });
  }

  const result = await upsertShortSelling(parsed);
  if ("error" in result) {
    return Response.json(rejectPayload(result.error), { status: 503 });
  }
  return Response.json({
    ok: true,
    written: result.written,
    accepted: parsed.length,
    as_of_date: parsed[0]?.as_of_date ?? null,
    session: parsed[0]?.session ?? null,
  });
}
