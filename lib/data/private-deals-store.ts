import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dealKey, mergeDealRows, parsePrivateDeals, type PrivateDeal } from "./private-market";

export async function listPrivateDeals(): Promise<PrivateDeal[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("private_deals")
    .select("id, announced_on, target, acquirer, sector, deal_type, deal_size, lead_investors, sources")
    .order("announced_on", { ascending: false })
    .limit(80);
  if (error || !data) return [];
  return parsePrivateDeals(
    data.map((row) => ({
      id: row.id,
      date: row.announced_on,
      target: row.target,
      acquirer: row.acquirer,
      sector: row.sector,
      dealType: row.deal_type,
      dealSize: row.deal_size,
      leadInvestors: row.lead_investors,
      sources: row.sources,
    })),
  );
}

export async function upsertPrivateDeals(rows: PrivateDeal[]): Promise<{ written: number } | { error: string }> {
  const db = getSupabaseAdmin();
  if (!db) return { written: 0 };
  const merged = mergeDealRows(rows);
  if (!merged.length) return { written: 0 };
  const { error, data } = await db
    .from("private_deals")
    .upsert(
      merged.map((row) => ({
        deal_key: dealKey(row),
        announced_on: row.announcedOn ? row.announcedOn.slice(0, 10) : null,
        target: row.target,
        acquirer: row.acquirer,
        sector: row.sector,
        deal_type: row.dealType,
        deal_size: row.dealSize,
        lead_investors: row.leadInvestors,
        sources: row.sources,
      })),
      { onConflict: "deal_key" },
    )
    .select("id");
  if (error) return { error: error.message };
  return { written: data?.length ?? merged.length };
}

export async function replacePrivateDeals(rows: PrivateDeal[]): Promise<{ written: number } | { error: string }> {
  const db = getSupabaseAdmin();
  if (!db) return { written: 0 };
  const { error: wipeError } = await db.from("private_deals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (wipeError) return { error: wipeError.message };
  return upsertPrivateDeals(rows);
}
