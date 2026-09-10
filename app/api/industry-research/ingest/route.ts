import { ingestAuthorized } from "@/lib/api/ingest-auth";
import { INDUSTRY_SECTORS, isIndustrySectorId, isIsoDate, hktCalendarDate, weekStartMonday } from "@/lib/data/industry-sectors";
import { writeSectorDigest } from "@/lib/data/industry";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return Response.json({
    ok: true,
    message: "POST with Bearer RESEARCH_INGEST_TOKEN to write a dated sector digest. One sector per request.",
    body: { sector: "ai", date: "YYYY-MM-DD Monday week start", locale: "zh", force: false, days: 7 },
    sectors: INDUSTRY_SECTORS.map((item) => item.id),
  });
}

export async function POST(request: Request) {
  if (!process.env.RESEARCH_INGEST_TOKEN?.trim()) {
    return Response.json({ error: "RESEARCH_INGEST_TOKEN is not set." }, { status: 503 });
  }
  if (!ingestAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const sectorRaw = String(body.sector ?? "ai");
  const sector = isIndustrySectorId(sectorRaw) ? sectorRaw : null;
  if (!sector) return Response.json({ error: "sector is required." }, { status: 400 });
  const locale = body.locale === "en" ? "en" : "zh";
  const today = hktCalendarDate();
  const date = weekStartMonday(isIsoDate(String(body.date ?? "")) ? String(body.date) : today);
  const force = body.force === true;
  const research = await writeSectorDigest(sector, locale, date, force);
  return Response.json({
    ok: true,
    sector: research.sector,
    date: research.date,
    locale: research.locale,
    headlines: research.headlines.length,
    beneficiaries: research.beneficiaries.length,
    atRisk: research.atRisk.length,
    brief: research.brief.length,
    persisted: research.persisted,
  });
}
