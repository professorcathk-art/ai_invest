import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSymbol } from "./normalize";
import {
  latestShortSellingRow,
  parseShortSellingRecord,
  preferDayClose,
  type HkexShortSellingRow,
} from "./hkex-short-selling";

const COLUMNS =
  "ticker, as_of_date, board, session, stock_name, short_shares, short_turnover_hkd, source_url";

function hydrate(data: unknown[] | null): HkexShortSellingRow[] {
  if (!data) return [];
  return data
    .map((row) => parseShortSellingRecord(row))
    .filter((row): row is HkexShortSellingRow => !("error" in row));
}

export async function listShortSelling(ticker: string, limit = 30): Promise<HkexShortSellingRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("hkex_short_selling")
    .select(COLUMNS)
    .eq("ticker", normalizeSymbol(ticker))
    .order("as_of_date", { ascending: false })
    .limit(limit * 2);
  if (error || !data) return [];
  return preferDayClose(hydrate(data)).slice(-limit);
}

export async function getLatestShortSelling(ticker: string): Promise<HkexShortSellingRow | null> {
  const rows = await listShortSelling(ticker, 30);
  return latestShortSellingRow(rows);
}

export async function upsertShortSelling(
  rows: HkexShortSellingRow[],
): Promise<{ written: number } | { error: string }> {
  const db = getSupabaseAdmin();
  if (!db) return { error: "Supabase is not configured." };
  if (rows.length === 0) return { written: 0 };
  let written = 0;
  const batchSize = 200;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error, data } = await db
      .from("hkex_short_selling")
      .upsert(chunk, { onConflict: "ticker,as_of_date,session" })
      .select("id");
    if (error) return { error: error.message };
    written += data?.length ?? chunk.length;
  }
  return { written };
}
