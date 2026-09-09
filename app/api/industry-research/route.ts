import { isIndustrySectorId, isIsoDate, hktCalendarDate } from "@/lib/data/industry-sectors";
import { listDigestDates, loadSectorResearch } from "@/lib/data/industry";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sectorRaw = url.searchParams.get("sector") ?? "ai";
  const sector = isIndustrySectorId(sectorRaw) ? sectorRaw : "ai";
  const locale = url.searchParams.get("lang") === "zh" ? "zh" : "en";
  const dateRaw = url.searchParams.get("date");
  const date = isIsoDate(dateRaw) ? dateRaw : hktCalendarDate();
  const daysRaw = Number(url.searchParams.get("days") ?? "3");
  const days = Number.isFinite(daysRaw) ? Math.min(7, Math.max(1, daysRaw)) : 3;
  if (url.searchParams.get("dates") === "1") {
    return Response.json({ sector, locale, dates: await listDigestDates(sector, locale) });
  }
  const research = await loadSectorResearch(sector, locale, date, days);
  return Response.json(research);
}
