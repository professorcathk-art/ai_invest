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
  impact: CatalystImpact;
}

export interface DividendCatalystPack {
  ticker: string;
  name: string;
  currency: string;
  source: "live" | "fallback";
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

function hashTicker(ticker: string): number {
  return [...ticker].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fallbackCurrency(ticker: string): string {
  return isHkTicker(ticker) ? "HKD" : "USD";
}

function knownFallback(ticker: string): DividendMetrics & { currency: string } | null {
  const table: Record<string, DividendMetrics & { currency: string }> = {
    "0005.HK": { yieldPct: 5.4, payoutRatioPct: 52, exDividendDate: null, annualDps: 4.7, currency: "HKD" },
    "0011.HK": { yieldPct: 5.1, payoutRatioPct: 50, exDividendDate: null, annualDps: 6.4, currency: "HKD" },
    "0939.HK": { yieldPct: 5.6, payoutRatioPct: 48, exDividendDate: null, annualDps: 0.4, currency: "HKD" },
    "1398.HK": { yieldPct: 5.8, payoutRatioPct: 50, exDividendDate: null, annualDps: 0.31, currency: "HKD" },
    "3988.HK": { yieldPct: 5.9, payoutRatioPct: 51, exDividendDate: null, annualDps: 0.24, currency: "HKD" },
    "2388.HK": { yieldPct: 5.2, payoutRatioPct: 49, exDividendDate: null, annualDps: 1.5, currency: "HKD" },
    "0941.HK": { yieldPct: 6.1, payoutRatioPct: 70, exDividendDate: null, annualDps: 4.8, currency: "HKD" },
    "1299.HK": { yieldPct: 2.3, payoutRatioPct: 35, exDividendDate: null, annualDps: 1.7, currency: "HKD" },
    "0388.HK": { yieldPct: 2.8, payoutRatioPct: 90, exDividendDate: null, annualDps: 9.1, currency: "HKD" },
    "0700.HK": { yieldPct: 0.8, payoutRatioPct: 14, exDividendDate: null, annualDps: 3.4, currency: "HKD" },
    "9988.HK": { yieldPct: 0.7, payoutRatioPct: 18, exDividendDate: null, annualDps: 1.0, currency: "HKD" },
    "3690.HK": { yieldPct: 0, payoutRatioPct: 0, exDividendDate: null, annualDps: 0, currency: "HKD" },
    AAPL: { yieldPct: 0.45, payoutRatioPct: 15, exDividendDate: null, annualDps: 1.0, currency: "USD" },
    MSFT: { yieldPct: 0.7, payoutRatioPct: 25, exDividendDate: null, annualDps: 3.3, currency: "USD" },
    JPM: { yieldPct: 2.1, payoutRatioPct: 28, exDividendDate: null, annualDps: 5.0, currency: "USD" },
    XOM: { yieldPct: 3.4, payoutRatioPct: 45, exDividendDate: null, annualDps: 3.9, currency: "USD" },
    NVDA: { yieldPct: 0.03, payoutRatioPct: 9, exDividendDate: null, annualDps: 0.04, currency: "USD" },
    TSLA: { yieldPct: 0, payoutRatioPct: 0, exDividendDate: null, annualDps: 0, currency: "USD" },
    AMZN: { yieldPct: 0, payoutRatioPct: 0, exDividendDate: null, annualDps: 0, currency: "USD" },
    GOOGL: { yieldPct: 0.3, payoutRatioPct: 8, exDividendDate: null, annualDps: 0.8, currency: "USD" },
    META: { yieldPct: 0.3, payoutRatioPct: 10, exDividendDate: null, annualDps: 2.1, currency: "USD" },
  };
  return table[ticker] ?? null;
}

export function fallbackDividendMetrics(ticker: string): DividendMetrics & { currency: string } {
  const known = knownFallback(ticker);
  if (known) return known;
  const bankLike = /^(0005|0011|0939|1398|3988|2388|2628)\.HK$/i.test(ticker);
  const growthLike = /NVDA|TSLA|AMZN|META|3690|1810|1024|9866|9868|2015/i.test(ticker);
  if (bankLike) {
    return { yieldPct: 5.2, payoutRatioPct: 50, exDividendDate: null, annualDps: 1.2, currency: fallbackCurrency(ticker) };
  }
  if (growthLike) {
    return { yieldPct: 0, payoutRatioPct: 0, exDividendDate: null, annualDps: 0, currency: fallbackCurrency(ticker) };
  }
  return { yieldPct: 1.2, payoutRatioPct: 28, exDividendDate: null, annualDps: 0.6, currency: fallbackCurrency(ticker) };
}

export function fallbackHistory(ticker: string, dps: number | null, currencyYear = new Date().getUTCFullYear()): DividendHistoryRow[] {
  const annual = dps != null && dps > 0 ? dps : fallbackDividendMetrics(ticker).annualDps ?? 0;
  if (annual <= 0) return [];
  return [0, 1, 2].map((offset) => ({
    period: String(currencyYear - offset),
    dps: Math.round(annual * (1 - offset * 0.06) * 1000) / 1000,
  }));
}

export function fallbackCatalysts(ticker: string, name: string, locale: Locale): CatalystEvent[] {
  const today = new Date().toISOString().slice(0, 10);
  const seed = hashTicker(ticker) % 21;
  const company = name || ticker;
  if (locale === "zh") {
    return [
      {
        type: "earnings",
        date: addDays(today, 18 + seed),
        title: `${company} 即將公布季度或中期業績`,
        impact: "volatility",
      },
      {
        type: "buyback",
        date: addDays(today, 40 + (seed % 7)),
        title: `${company} 回購或派息政策檢討窗口`,
        impact: "bullish",
      },
      {
        type: "product",
        date: addDays(today, 55 + (seed % 11)),
        title: `${company} 產品或業務更新可能影響市場預期`,
        impact: "bullish",
      },
      {
        type: "regulatory",
        date: addDays(today, 72 + (seed % 9)),
        title: `${isHkTicker(ticker) ? "港交所／監管" : "SEC／行業監管"} 披露與合規節點`,
        impact: "volatility",
      },
    ];
  }
  return [
    {
      type: "earnings",
      date: addDays(today, 18 + seed),
      title: `${company} upcoming earnings or interim results`,
      impact: "volatility",
    },
    {
      type: "buyback",
      date: addDays(today, 40 + (seed % 7)),
      title: `${company} buyback or dividend-policy review window`,
      impact: "bullish",
    },
    {
      type: "product",
      date: addDays(today, 55 + (seed % 11)),
      title: `${company} product or operating update that can reset estimates`,
      impact: "bullish",
    },
    {
      type: "regulatory",
      date: addDays(today, 72 + (seed % 9)),
      title: `${isHkTicker(ticker) ? "HKEX / regulatory" : "SEC / sector-regulatory"} disclosure window`,
      impact: "volatility",
    },
  ];
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
      title:
        locale === "zh"
          ? item.title
          : item.title,
      impact: classified.impact,
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
  const fallback = fallbackDividendMetrics(ticker);
  let currency = fallback.currency;
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
    // Yahoo is optional; FMP / fallback below.
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

  if (!live) {
    return {
      ticker,
      name: resolvedName,
      currency: fallback.currency,
      live: false,
      dividend: {
        yieldPct: fallback.yieldPct,
        payoutRatioPct: fallback.payoutRatioPct,
        exDividendDate: fallback.exDividendDate ?? addDays(new Date().toISOString().slice(0, 10), 12 + (hashTicker(ticker) % 20)),
        annualDps: fallback.annualDps,
      },
      history: fallbackHistory(ticker, fallback.annualDps),
      earningsDate,
    };
  }

  if (history.length === 0 && dividend.annualDps != null && dividend.annualDps > 0) {
    history = fallbackHistory(ticker, dividend.annualDps);
  }

  return { ticker, name: resolvedName, currency, live: true, dividend, history, earningsDate };
}

export function parseCatalystEvent(input: unknown): CatalystEvent | null {
  if (!input || typeof input !== "object") return null;
  const rec = input as Record<string, unknown>;
  const typeRaw = String(rec.type ?? "other").toLowerCase();
  const impactRaw = String(rec.impact ?? "volatility").toLowerCase();
  const title = String(rec.title ?? "").trim();
  if (!title) return null;
  return {
    type: isCatalystType(typeRaw) ? typeRaw : "other",
    date: dateOnly(rec.date),
    title,
    impact: isCatalystImpact(impactRaw) ? impactRaw : "volatility",
  };
}

export function finalizeCatalystPack(input: {
  ticker: string;
  name: string;
  currency: string;
  source: "live" | "fallback";
  synthesized: boolean;
  dividend: DividendMetrics;
  history: DividendHistoryRow[];
  catalysts: CatalystEvent[];
  locale: Locale;
}): DividendCatalystPack {
  const ticker = normalizeSymbol(input.ticker);
  const catalysts = input.catalysts
    .map(parseCatalystEvent)
    .filter((row): row is CatalystEvent => row != null)
    .slice(0, 5);
  return {
    ticker,
    name: input.name || ticker,
    currency: isHkTicker(ticker) ? "HKD" : input.currency || fallbackCurrency(ticker),
    source: input.source,
    synthesized: input.synthesized,
    dividend: input.dividend,
    history: input.history.slice(0, 3),
    catalysts: catalysts.length > 0 ? catalysts : fallbackCatalysts(ticker, input.name, input.locale),
  };
}
