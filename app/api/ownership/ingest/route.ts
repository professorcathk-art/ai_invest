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
    const rejected = /rejected:/i.test(parsed.error);
    return Response.json(
      {
        error: parsed.error,
        hint: rejected
          ? "Do not invent holdings. HK rows need named CCASS participants from HKEX; US rows need Yahoo 13F/Form 4 fields. POST /api/ownership/ingest with Bearer RESEARCH_INGEST_TOKEN."
          : undefined,
      },
      { status: 400 },
    );
  }

  const result = await upsertOwnership(parsed);
  if ("error" in result) {
    const rejected = /rejected:/i.test(result.error);
    return Response.json(
      {
        error: result.error,
        hint: rejected
          ? "Do not invent holdings. HK rows need named CCASS participants; US rows need Yahoo 13F/Form 4 fields. Use RESEARCH_INGEST_TOKEN against /api/ownership/ingest — never write estimated percentages with the service role."
          : undefined,
      },
      { status: rejected ? 400 : 503 },
    );
  }
  return Response.json({ ok: true, written: result.written });
}
