import { isIndustrySectorId, isIsoDate, hktCalendarDate, weekStartMonday } from "@/lib/data/industry-sectors";
import { listDigestDates, loadSectorResearch } from "@/lib/data/industry";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sectorRaw = url.searchParams.get("sector") ?? "ai";
  const sector = isIndustrySectorId(sectorRaw) ? sectorRaw : "ai";
  const locale = url.searchParams.get("lang") === "zh" ? "zh" : "en";
  const dateRaw = url.searchParams.get("date");
  const date = weekStartMonday(isIsoDate(dateRaw) ? dateRaw : hktCalendarDate());
  if (url.searchParams.get("dates") === "1") {
    return Response.json({ sector, locale, dates: await listDigestDates(sector, locale) });
  }
  const research = await loadSectorResearch(sector, locale, date);
  return Response.json(research, { headers: { "Cache-Control": "no-store" } });
}
