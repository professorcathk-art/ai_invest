import type { CompanyFinancials } from "@/lib/engines/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const STATEMENT_TTL_MS = 24 * 60 * 60 * 1000;

export async function readCachedFinancials(ticker: string): Promise<CompanyFinancials | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from("financial_snapshots")
    .select("quote, statements, warnings, source, expires_at")
    .eq("ticker", ticker)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  const { defaultRates, isUsableFinancials } = await import("./normalize");
  const financials: CompanyFinancials = {
    quote: data.quote as CompanyFinancials["quote"],
    years: data.statements as CompanyFinancials["years"],
    source: data.source as CompanyFinancials["source"],
    warnings: (data.warnings as string[]) ?? [],
    defaults: defaultRates(ticker),
  };
  if (!isUsableFinancials(financials)) return null;
  return financials;
}

export async function writeCachedFinancials(financials: CompanyFinancials): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  await db.from("financial_snapshots").upsert(
    {
      ticker: financials.quote.ticker,
      source: financials.source,
      quote: financials.quote,
      statements: financials.years,
      warnings: financials.warnings,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + STATEMENT_TTL_MS).toISOString(),
    },
    { onConflict: "ticker" },
  );
}

export async function writeAnalysis(input: {
  ticker: string;
  assumptions: unknown;
  engines: unknown;
  personas: unknown;
}): Promise<string | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from("analyses")
    .insert({
      ticker: input.ticker,
      assumptions: input.assumptions,
      engines: input.engines,
      personas: input.personas,
    })
    .select("id")
    .single();
  if (error) return null;
  return data.id as string;
}
