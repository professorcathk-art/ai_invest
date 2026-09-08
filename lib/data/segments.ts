import type { Locale } from "@/lib/i18n/messages";
import type { CompanyContext, NewsItem } from "./context";
import { fmpStable } from "./fmp-client";

export interface SegmentSlice {
  name: string;
  value: number;
  share: number;
  period?: string;
}

export interface ProductCard {
  name: string;
  description: string;
}

export interface RoadmapItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
}

export interface BusinessBreakdown {
  ticker: string;
  period: string | null;
  currency: string | null;
  products: SegmentSlice[];
  geos: SegmentSlice[];
  productCards: ProductCard[];
  roadmap: RoadmapItem[];
  sourced: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numericEntries(row: Record<string, unknown>): Array<[string, number]> {
  const skip = new Set([
    "date",
    "symbol",
    "calendarYear",
    "fiscalYear",
    "period",
    "reportedCurrency",
    "cik",
    "fillingDate",
    "acceptedDate",
    "link",
    "finalLink",
  ]);
  const out: Array<[string, number]> = [];
  for (const [key, raw] of Object.entries(row)) {
    if (skip.has(key)) continue;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    out.push([key, value]);
  }
  return out;
}

/** Flatten FMP product / geo payloads (nested year maps or flat date rows). */
export function parseSegmentPayload(raw: unknown): { period: string | null; slices: SegmentSlice[] } {
  if (!raw) return { period: null, slices: [] };

  const rows = Array.isArray(raw) ? raw : [raw];
  let bestPeriod: string | null = null;
  let bestEntries: Array<[string, number]> = [];

  const consider = (period: string | null, entries: Array<[string, number]>) => {
    if (entries.length < 1) return;
    const newer = period && (!bestPeriod || period > bestPeriod);
    const first = bestEntries.length === 0;
    if (first || newer) {
      bestPeriod = period ?? bestPeriod;
      bestEntries = entries;
    }
  };

  for (const row of rows) {
    if (typeof row === "number" || typeof row === "string") continue;
    if (Array.isArray(row)) {
      const nested = parseSegmentPayload(row);
      if (nested.slices.length) {
        consider(
          nested.period,
          nested.slices.map((s) => [s.name, s.value]),
        );
      }
      continue;
    }
    if (!isRecord(row)) continue;

    if (isRecord(row.data) && numericEntries(row.data).length) {
      consider(String(row.date ?? row.fiscalYear ?? row.calendarYear ?? ""), numericEntries(row.data));
      continue;
    }

    if (typeof row.date === "string" || typeof row.calendarYear === "string") {
      consider(String(row.date ?? row.calendarYear), numericEntries(row));
      continue;
    }

    for (const [outerKey, outerVal] of Object.entries(row)) {
      if (isRecord(outerVal) && numericEntries(outerVal).length) {
        consider(/^\d{4}/.test(outerKey) ? outerKey : null, numericEntries(outerVal));
        continue;
      }
      if (Array.isArray(outerVal)) {
        const nested = parseSegmentPayload(outerVal);
        if (nested.slices.length) {
          consider(
            nested.period ?? (/^\d{4}/.test(outerKey) ? outerKey : null),
            nested.slices.map((s) => [s.name, s.value]),
          );
        }
      }
    }
  }

  const total = bestEntries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return { period: null, slices: [] };
  const slices = bestEntries
    .map(([name, value]) => ({ name, value, share: value / total, period: bestPeriod ?? undefined }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  return { period: bestPeriod, slices };
}

const ROADMAP_RE =
  /\b(strateg|roadmap|outlook|guidance|expand|expansion|transform|AI|artificial intelligence|overseas|cost cut|restructuring|manufactur|factory|robot)/i;
const ROADMAP_RE_ZH = /戰略|策略|展望|指引|擴張|出海|轉型|人工智能|降本|重組|產能|工廠|機器人/;

export function roadmapFromNews(news: NewsItem[]): RoadmapItem[] {
  return news
    .filter((item) => ROADMAP_RE.test(item.title) || ROADMAP_RE_ZH.test(item.title))
    .slice(0, 4)
    .map((item) => ({
      title: item.title,
      source: item.publisher,
      url: item.url,
      publishedAt: item.publishedAt,
    }));
}

export function productCardsFromContext(
  ctx: CompanyContext,
  segments: SegmentSlice[],
): ProductCard[] {
  if (segments.length) {
    return segments.slice(0, 6).map((seg) => ({
      name: seg.name,
      description: `${(seg.share * 100).toFixed(1)}% of latest sourced segment revenue.`,
    }));
  }
  const summary = ctx.businessSummary.replace(/\s+/g, " ").trim();
  if (!summary) return [];
  const listMatch = summary.match(
    /(?:including|includes|include|comprises|consists of|products? (?:include|are)|業務包括)\s+([^.。]{12,220})/i,
  );
  if (listMatch?.[1]) {
    const parts = listMatch[1]
      .split(/,|;| and |以及|及|與/)
      .map((part) => part.replace(/\band\b/gi, "").trim())
      .filter((part) => part.length > 2 && part.length < 64);
    if (parts.length >= 2) {
      return parts.slice(0, 6).map((name) => ({
        name,
        description: summary.slice(0, 240),
      }));
    }
  }
  const sentences = summary.split(/(?<=[.。])\s+/).filter((s) => s.length > 40);
  return sentences.slice(0, 3).map((sentence, i) => ({
    name: i === 0 ? "Core business" : `Line ${i + 1}`,
    description: sentence.slice(0, 280),
  }));
}

export function emptyBreakdown(ticker: string): BusinessBreakdown {
  return {
    ticker,
    period: null,
    currency: null,
    products: [],
    geos: [],
    productCards: [],
    roadmap: [],
    sourced: false,
  };
}

export async function fetchCompanySegments(ticker: string): Promise<{
  products: SegmentSlice[];
  geos: SegmentSlice[];
  period: string | null;
}> {
  const symbol = encodeURIComponent(ticker);
  const [product, geo] = await Promise.all([
    fmpStable(`/revenue-product-segmentation?symbol=${symbol}`),
    fmpStable(`/revenue-geographic-segmentation?symbol=${symbol}`),
  ]);
  const products = parseSegmentPayload(product);
  const geos = parseSegmentPayload(geo);
  return {
    products: products.slices,
    geos: geos.slices,
    period: products.period ?? geos.period,
  };
}

export async function buildBusinessBreakdown(
  ticker: string,
  ctx: CompanyContext,
): Promise<BusinessBreakdown> {
  const segs = await fetchCompanySegments(ticker);
  const productCards = productCardsFromContext(ctx, segs.products);
  const roadmap = roadmapFromNews(ctx.news);
  const sourced = segs.products.length > 0 || segs.geos.length > 0 || productCards.length > 0 || roadmap.length > 0;
  return {
    ticker,
    period: segs.period,
    currency: null,
    products: segs.products,
    geos: segs.geos,
    productCards,
    roadmap,
    sourced,
  };
}

export function segmentBrief(breakdown: BusinessBreakdown, locale: Locale): string {
  if (!breakdown.sourced) {
    return locale === "zh"
      ? "Segment data: none sourced. Do not invent business-line or geographic mix."
      : "Segment data: none sourced. Do not invent business-line or geographic mix.";
  }
  const prod = breakdown.products
    .map((s) => `${s.name} ${(s.share * 100).toFixed(1)}%`)
    .join("; ");
  const geo = breakdown.geos.map((s) => `${s.name} ${(s.share * 100).toFixed(1)}%`).join("; ");
  return [
    breakdown.period ? `Latest segment period: ${breakdown.period}` : "",
    prod ? `Revenue by product / segment (sourced): ${prod}` : "Revenue by product: not disclosed in feed.",
    geo ? `Revenue by geography (sourced): ${geo}` : "Revenue by geography: not disclosed in feed.",
    "Background only. Use a line of business if it is material to YOUR mental model. Never invent a mix.",
  ]
    .filter(Boolean)
    .join("\n");
}
