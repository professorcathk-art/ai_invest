import { createHash } from "crypto";
import type { AnalysisDepth, Locale } from "@/lib/i18n/messages";
import type { SliderAssumptions } from "@/lib/engines/types";
import type { IcAnalysis } from "@/lib/llm/schemas";
import type { PersonaId } from "@/lib/llm/persona-ids";
import { personasKey } from "@/lib/llm/persona-ids";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const ANALYSIS_CACHE_TTL_MS = 72 * 60 * 60 * 1000;

export function hashPersonas(ids: readonly PersonaId[]): string {
  return createHash("sha256").update(personasKey(ids)).digest("hex");
}

export function hashAssumptions(sliders: SliderAssumptions, locale: Locale): string {
  const coarse = {
    locale,
    wacc: Math.round(sliders.wacc * 1000) / 1000,
    tg: Math.round(sliders.terminalGrowth * 1000) / 1000,
    exit: Math.round(sliders.exitMultiple * 10) / 10,
    debt: Math.round(sliders.debtPct * 100) / 100,
  };
  return createHash("sha256").update(JSON.stringify(coarse)).digest("hex");
}

export function analysisCacheKey(input: {
  ticker: string;
  mode: AnalysisDepth;
  personas: readonly PersonaId[];
  sliders: SliderAssumptions;
  locale: Locale;
}) {
  return {
    ticker: input.ticker.trim().toUpperCase(),
    mode: input.mode,
    personasHash: hashPersonas(input.personas),
    assumptionsHash: hashAssumptions(input.sliders, input.locale),
    locale: input.locale,
  };
}

export async function readCachedAnalysis(input: {
  ticker: string;
  mode: AnalysisDepth;
  personas: readonly PersonaId[];
  sliders: SliderAssumptions;
  locale: Locale;
}): Promise<{ analysis: IcAnalysis; cachedAt: string } | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const key = analysisCacheKey(input);
  const since = new Date(Date.now() - ANALYSIS_CACHE_TTL_MS).toISOString();
  const { data, error } = await db
    .from("cached_analyses")
    .select("analysis_data, created_at")
    .eq("ticker", key.ticker)
    .eq("mode", key.mode)
    .eq("personas_hash", key.personasHash)
    .eq("locale", key.locale)
    .eq("assumptions_hash", key.assumptionsHash)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const analysis = data.analysis_data as IcAnalysis | null;
  if (!analysis?.narratives?.length || !analysis.debate?.length) return null;
  return { analysis, cachedAt: String(data.created_at) };
}

export async function writeCachedAnalysis(input: {
  ticker: string;
  mode: AnalysisDepth;
  personas: readonly PersonaId[];
  sliders: SliderAssumptions;
  locale: Locale;
  analysis: IcAnalysis;
}): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  const key = analysisCacheKey(input);
  await db.from("cached_analyses").insert({
    ticker: key.ticker,
    mode: key.mode,
    personas_hash: key.personasHash,
    locale: key.locale,
    assumptions_hash: key.assumptionsHash,
    analysis_data: input.analysis,
  });
}
