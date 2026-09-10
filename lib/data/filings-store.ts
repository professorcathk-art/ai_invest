import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSymbol } from "./normalize";
import { isFilingDocType, type CompanyFiling } from "./filings";

function hydrate(row: Record<string, unknown>): CompanyFiling | null {
  const ticker = normalizeSymbol(String(row.ticker ?? ""));
  const fiscalYear = Number(row.fiscal_year);
  const docType = String(row.doc_type ?? "");
  const publicUrl = String(row.public_url ?? "").trim();
  if (!ticker || !Number.isFinite(fiscalYear) || !isFilingDocType(docType) || !publicUrl) return null;
  return {
    ticker,
    fiscalYear,
    docType,
    title: String(row.title ?? "").trim(),
    sourceUrl: String(row.source_url ?? "").trim(),
    storagePath: String(row.storage_path ?? "").trim(),
    publicUrl,
    excerpt: String(row.excerpt ?? ""),
    bytes: Number(row.bytes ?? 0) || 0,
    fetchedAt: row.fetched_at ? String(row.fetched_at) : null,
  };
}

export async function listCompanyFilings(ticker: string, limit = 6): Promise<CompanyFiling[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("company_filings")
    .select("ticker, fiscal_year, doc_type, title, source_url, storage_path, public_url, excerpt, bytes, fetched_at")
    .eq("ticker", normalizeSymbol(ticker))
    .order("fiscal_year", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => hydrate(row as Record<string, unknown>)).filter((row): row is CompanyFiling => row != null);
}

export async function upsertCompanyFiling(row: CompanyFiling): Promise<{ ok: true } | { error: string }> {
  const db = getSupabaseAdmin();
  if (!db) return { error: "Supabase is not configured." };
  const { error } = await db.from("company_filings").upsert(
    {
      ticker: normalizeSymbol(row.ticker),
      fiscal_year: row.fiscalYear,
      doc_type: row.docType,
      title: row.title,
      source_url: row.sourceUrl,
      storage_path: row.storagePath,
      public_url: row.publicUrl,
      excerpt: row.excerpt.slice(0, 20_000),
      bytes: row.bytes,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "ticker,fiscal_year,doc_type" },
  );
  if (error) return { error: error.message };
  return { ok: true };
}
