import { ingestAuthorized } from "@/lib/api/ingest-auth";
import { parseIngestBody } from "@/lib/data/ownership";
import { upsertOwnership } from "@/lib/data/ownership-store";

export const runtime = "nodejs";

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
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const result = await upsertOwnership(parsed);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 503 });
  }
  return Response.json({ ok: true, written: result.written });
}
