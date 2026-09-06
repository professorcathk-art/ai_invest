import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSymbol } from "./normalize";
import {
  parseOwnershipRecord,
  type OwnershipSnapshot,
} from "./ownership";

export async function listOwnership(ticker: string, limit = 30): Promise<OwnershipSnapshot[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("ownership_snapshots")
    .select(
      "ticker, as_of_date, market_type, institutional_pct, retail_pct, inst_holding_pct, insider_holding_pct, short_interest_pct, net_insider_usd, top_buyers, top_sellers, signal_type",
    )
    .eq("ticker", normalizeSymbol(ticker))
    .order("as_of_date", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data
    .map((row) => parseOwnershipRecord(row))
    .filter((row): row is OwnershipSnapshot => !("error" in row));
}

export async function upsertOwnership(rows: OwnershipSnapshot[]): Promise<{ written: number } | { error: string }> {
  const db = getSupabaseAdmin();
  if (!db) return { error: "Supabase is not configured." };
  const { error, data } = await db
    .from("ownership_snapshots")
    .upsert(rows, { onConflict: "ticker,as_of_date" })
    .select("id");
  if (error) return { error: error.message };
  return { written: data?.length ?? rows.length };
}
