import type { AnalysisDepth, Locale } from "@/lib/i18n/messages";
import type { IcAnalysis } from "@/lib/llm/schemas";
import type { PersonaId } from "@/lib/llm/persona-ids";

export const LOCAL_ANALYSIS_KEY = "investmouse.analysisCache.v1";
export const LOCAL_ANALYSIS_TTL_MS = 72 * 60 * 60 * 1000;

export interface LocalAnalysisEntry {
  ticker: string;
  locale: Locale;
  depth: AnalysisDepth;
  personas: PersonaId[];
  analysis: IcAnalysis;
  cachedAt: string;
}

export function keepFreshEntries(rows: unknown[], now = Date.now()): LocalAnalysisEntry[] {
  const cutoff = now - LOCAL_ANALYSIS_TTL_MS;
  return rows.filter((row): row is LocalAnalysisEntry => {
    if (!row || typeof row !== "object") return false;
    const rec = row as LocalAnalysisEntry;
    if (!rec.ticker || !rec.analysis?.narratives?.length) return false;
    return new Date(rec.cachedAt).getTime() >= cutoff;
  });
}

function readAll(): LocalAnalysisEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_ANALYSIS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return keepFreshEntries(parsed);
  } catch {
    return [];
  }
}

function writeAll(rows: LocalAnalysisEntry[]) {
  try {
    window.localStorage.setItem(LOCAL_ANALYSIS_KEY, JSON.stringify(rows.slice(0, 24)));
  } catch {
    // Quota / private mode.
  }
}

export function readLocalAnalysis(ticker: string, locale: Locale): LocalAnalysisEntry | null {
  const symbol = ticker.trim().toUpperCase();
  const match = readAll().find((row) => row.ticker === symbol && row.locale === locale);
  return match ?? readAll().find((row) => row.ticker === symbol) ?? null;
}

export function writeLocalAnalysis(entry: LocalAnalysisEntry): void {
  const ticker = entry.ticker.trim().toUpperCase();
  const next = [
    { ...entry, ticker, cachedAt: entry.cachedAt || new Date().toISOString() },
    ...readAll().filter((row) => !(row.ticker === ticker && row.locale === entry.locale)),
  ];
  writeAll(next);
}
