import type { Locale } from "@/lib/i18n/messages";
import { isHkTicker, normalizeSymbol } from "./normalize";
import type { NewsItem } from "./context";

export const CATALYST_TYPES = ["earnings", "buyback", "product", "regulatory", "other"] as const;
export const CATALYST_IMPACTS = ["bullish", "bearish", "volatility"] as const;

export type CatalystType = (typeof CATALYST_TYPES)[number];
export type CatalystImpact = (typeof CATALYST_IMPACTS)[number];

export interface DividendMetrics {
  yieldPct: number | null;
  payoutRatioPct: number | null;
  exDividendDate: string | null;
  annualDps: number | null;
}

export interface DividendHistoryRow {
  period: string;
  dps: number;
}

export interface CatalystEvent {
  type: CatalystType;
  date: string | null;
  title: string;
  detail: string | null;
  impact: CatalystImpact;
  source: string | null;
  sourceUrl: string | null;
}

export interface DividendCatalystPack {
  ticker: string;
  name: string;
  currency: string;
  source: "live" | "empty";
  synthesized: boolean;
  dividend: DividendMetrics;
  history: DividendHistoryRow[];
  catalysts: CatalystEvent[];
}

function client() {
  return import("yahoo-finance2").then((mod) => new mod.default({ suppressNotices: ["yahooSurvey"] }));
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "object" && "raw" in value) return num((value as { raw: unknown }).raw);
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOnly(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && value && "raw" in value) {
    const raw = Number((value as { raw: number }).raw);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/** Yahoo quoteSummary ratios are decimals; quote fields are often already percent. */
export function ratioToPct(value: unknown, alreadyPercent = false): number | null {
  const n = num(value);
  if (n == null || n < 0) return null;
  const pct = alreadyPercent ? n : n <= 1.5 ? n * 100 : n;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 100) / 100;
}

export function isCatalystType(value: string): value is CatalystType {
  return (CATALYST_TYPES as readonly string[]).includes(value);
}

export function isCatalystImpact(value: string): value is CatalystImpact {
  return (CATALYST_IMPACTS as readonly string[]).includes(value);
}

function listingCurrency(ticker: string): string {
  return isHkTicker(ticker) ? "HKD" : "USD";
}

function classifyHeadline(title: string): { type: CatalystType; impact: CatalystImpact } {
  const t = title.toLowerCase();
  if (/earnings|results|業績|年報|中期|quarter|eps/.test(t)) return { type: "earnings", impact: "volatility" };
  if (/buyback|repurchase|回購|dividend|派息|special dividend/.test(t)) return { type: "buyback", impact: "bullish" };
  if (/launch|product|release|發布|新品|model/.test(t)) return { type: "product", impact: "bullish" };
  if (/sec|sfc|antitrust|probe|fine|監管|調查|訴訟|ban/.test(t)) return { type: "regulatory", impact: "bearish" };
  if (/miss|cut|downgrade|profit warning|盈警|下滑/.test(t)) return { type: "other", impact: "bearish" };
  return { type: "other", impact: "volatility" };
}

export function catalystsFromNews(news: NewsItem[], locale: Locale): CatalystEvent[] {
  return news.slice(0, 5).map((item) => {
    const classified = classifyHeadline(item.title);
    return {
      type: classified.type,
      date: item.publishedAt ? item.publishedAt.slice(0, 10) : null,
      title: item.title,
      detail: locale === "zh" ? item.title : item.title,
      impact: classified.impact,
      source: item.publisher || null,
      sourceUrl: item.url || null,
    };
  });
}

function historyFromMap(byYear: Map<number, number>): DividendHistoryRow[] {
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 3)
    .map(([year, dps]) => ({ period: String(year), dps: Math.round(dps * 1000) / 1000 }));
}

async function fetchFmpDividends(ticker: string): Promise<{
  metrics: Partial<DividendMetrics>;
  history: DividendHistoryRow[];
} | null> {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/${encodeURIComponent(ticker)}?apikey=${key}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { historical?: Array<{ date?: string; adjDividend?: number; dividend?: number }> };
    const rows = Array.isArray(json.historical) ? json.historical : [];
    if (rows.length === 0) return null;
    const byYear = new Map<number, number>();
    for (const row of rows) {
      const date = dateOnly(row.date);
      const dps = num(row.adjDividend ?? row.dividend);
      if (!date || dps == null || dps <= 0) continue;
      const year = Number(date.slice(0, 4));
      byYear.set(year, (byYear.get(year) ?? 0) + dps);
    }
    const history = historyFromMap(byYear);
    const latest = rows.find((row) => dateOnly(row.date));
    return {
      metrics: { exDividendDate: dateOnly(latest?.date), annualDps: history[0]?.dps ?? null },
      history,
    };
  } catch {
    return null;
  }
}

export async function fetchLiveDividendPack(
  symbol: string,
  name = "",
): Promise<{
  ticker: string;
  name: string;
  currency: string;
  live: boolean;
  dividend: DividendMetrics;
  history: DividendHistoryRow[];
  earningsDate: string | null;
}> {
  const ticker = normalizeSymbol(symbol);
  let currency = listingCurrency(ticker);
  let resolvedName = name || ticker;
  const dividend: DividendMetrics = {
    yieldPct: null,
    payoutRatioPct: null,
    exDividendDate: null,
    annualDps: null,
  };
  let history: DividendHistoryRow[] = [];
  let earningsDate: string | null = null;
  let live = false;

  try {
    const yf = await client();
    const period1 = new Date();
    period1.setUTCFullYear(period1.getUTCFullYear() - 3);
    const [quote, summary, chart] = await Promise.all([
      yf.quote(ticker).catch(() => null),
      yf
        .quoteSummary(ticker, {
          modules: ["summaryDetail", "calendarEvents", "price", "defaultKeyStatistics"],
        })
        .catch(() => null),
      yf
        .chart(ticker, {
          period1: period1.toISOString().slice(0, 10),
          interval: "1d",
          events: "div|split|earn",
        })
        .catch(() => null),
    ]);

    const detail = summary?.summaryDetail as Record<string, unknown> | undefined;
    const cal = summary?.calendarEvents as
      | {
          exDividendDate?: unknown;
          dividendDate?: unknown;
          earnings?: { earningsDate?: unknown[] };
        }
      | undefined;
    const priceMod = summary?.price as { currency?: string; longName?: string; shortName?: string } | undefined;
    currency = String(quote?.currency ?? priceMod?.currency ?? currency);
    if (isHkTicker(ticker)) currency = "HKD";
    resolvedName = String(priceMod?.longName ?? priceMod?.shortName ?? quote?.shortName ?? resolvedName);

    const quoteRec = (quote ?? {}) as Record<string, unknown>;
    dividend.annualDps = num(detail?.dividendRate ?? detail?.trailingAnnualDividendRate ?? quoteRec.dividendRate ?? quoteRec.trailingAnnualDividendRate);
    dividend.yieldPct =
      ratioToPct(detail?.dividendYield ?? detail?.trailingAnnualDividendYield) ??
      ratioToPct(quoteRec.trailingAnnualDividendYield ?? quoteRec.dividendYield, true);
    dividend.payoutRatioPct = ratioToPct(detail?.payoutRatio);
    dividend.exDividendDate = dateOnly(cal?.exDividendDate ?? detail?.exDividendDate ?? quoteRec.exDividendDate);
    const earnRaw = cal?.earnings?.earningsDate?.[0];
    earningsDate = dateOnly(earnRaw);

    const events = (chart as { events?: { dividends?: Array<{ date?: unknown; amount?: unknown }> | Record<string, { date?: unknown; amount?: unknown }> } } | null)
      ?.events?.dividends;
    const dividendRows = Array.isArray(events) ? events : events ? Object.values(events) : [];
    if (dividendRows.length) {
      const byYear = new Map<number, number>();
      for (const row of dividendRows) {
        const date = dateOnly(row.date);
        const amount = num(row.amount);
        if (!date || amount == null || amount <= 0) continue;
        const year = Number(date.slice(0, 4));
        byYear.set(year, (byYear.get(year) ?? 0) + amount);
      }
      history = historyFromMap(byYear);
    }

    live = [dividend.yieldPct, dividend.payoutRatioPct, dividend.exDividendDate, dividend.annualDps].some((v) => v != null) || history.length > 0;
  } catch {
    // Yahoo is optional; FMP may still have a live history.
  }

  if (history.length === 0 || dividend.annualDps == null) {
    const fmp = await fetchFmpDividends(ticker);
    if (fmp) {
      if (history.length === 0) history = fmp.history;
      if (dividend.annualDps == null) dividend.annualDps = fmp.metrics.annualDps ?? null;
      if (!dividend.exDividendDate) dividend.exDividendDate = fmp.metrics.exDividendDate ?? null;
      if (fmp.history.length) live = true;
    }
  }

  return { ticker, name: resolvedName, currency, live, dividend, history, earningsDate };
}

export function parseCatalystEvent(input: unknown): CatalystEvent | null {
  if (!input || typeof input !== "object") return null;
  const rec = input as Record<string, unknown>;
  const typeRaw = String(rec.type ?? "other").toLowerCase();
  const impactRaw = String(rec.impact ?? "volatility").toLowerCase();
  const title = String(rec.title ?? "").trim();
  if (!title) return null;
  const sourceUrl = String(rec.sourceUrl ?? rec.source_url ?? rec.url ?? "").trim();
  const source = String(rec.source ?? rec.publisher ?? "").trim();
  const detail = String(rec.detail ?? rec.summary ?? "").trim();
  return {
    type: isCatalystType(typeRaw) ? typeRaw : "other",
    date: dateOnly(rec.date),
    title,
    detail: detail || null,
    impact: isCatalystImpact(impactRaw) ? impactRaw : "volatility",
    source: source || null,
    sourceUrl: sourceUrl || null,
  };
}

export function finalizeCatalystPack(input: {
  ticker: string;
  name: string;
  currency: string;
  source: "live" | "empty";
  synthesized: boolean;
  dividend: DividendMetrics;
  history: DividendHistoryRow[];
  catalysts: CatalystEvent[];
}): DividendCatalystPack {
  const ticker = normalizeSymbol(input.ticker);
  const catalysts = input.catalysts
    .map(parseCatalystEvent)
    .filter((row): row is CatalystEvent => row != null)
    .slice(0, 5);
  return {
    ticker,
    name: input.name || ticker,
    currency: isHkTicker(ticker) ? "HKD" : input.currency || listingCurrency(ticker),
    source: input.source,
    synthesized: input.synthesized,
    dividend: input.dividend,
    history: input.history.slice(0, 3),
    catalysts,
  };
}
