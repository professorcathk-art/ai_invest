import { isIndustrySectorId } from "@/lib/data/industry-sectors";
import { loadSectorResearch } from "@/lib/data/industry";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sectorRaw = url.searchParams.get("sector") ?? "ai";
  const sector = isIndustrySectorId(sectorRaw) ? sectorRaw : "ai";
  const locale = url.searchParams.get("lang") === "zh" ? "zh" : "en";
  const research = await loadSectorResearch(sector, locale);
  return Response.json(research);
}
