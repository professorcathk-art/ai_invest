import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hydrateResearch, type IndustrySectorId, type SectorResearch } from "./industry-sectors";

export async function getIndustryDigest(
  sector: IndustrySectorId,
  locale: "en" | "zh",
  date: string,
): Promise<SectorResearch | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from("industry_digests")
    .select("as_of_date, sector, locale, headlines, beneficiaries, at_risk, brief")
    .eq("sector", sector)
    .eq("locale", locale)
    .eq("as_of_date", date)
    .maybeSingle();
  if (error || !data) return null;
  return hydrateResearch({
    ...data,
    sector: data.sector as IndustrySectorId,
    locale: data.locale === "zh" ? "zh" : "en",
  });
}

export async function listIndustryDigestDates(sector: IndustrySectorId, locale: "en" | "zh"): Promise<string[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("industry_digests")
    .select("as_of_date")
    .eq("sector", sector)
    .eq("locale", locale)
    .order("as_of_date", { ascending: false })
    .limit(30);
  if (error || !data) return [];
  return [...new Set(data.map((row) => String(row.as_of_date).slice(0, 10)))];
}

export async function upsertIndustryDigest(row: SectorResearch): Promise<SectorResearch | null> {
  const db = getSupabaseAdmin();
  if (!db) return row;
  const { error } = await db.from("industry_digests").upsert(
    {
      as_of_date: row.date,
      sector: row.sector,
      locale: row.locale,
      headlines: row.headlines,
      beneficiaries: row.beneficiaries,
      at_risk: row.atRisk,
      brief: row.brief,
      source: row.brief.length ? "rss+desk" : "rss",
    },
    { onConflict: "as_of_date,sector,locale" },
  );
  if (error) return null;
  return { ...row, persisted: true, live: false };
}
