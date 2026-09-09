export const INDUSTRY_SECTORS = [
  {
    id: "ai",
    tickers: ["NVDA", "AVGO", "AMD", "TSM", "AAPL", "MSFT", "0981.HK"],
    aliases: {
      NVDA: ["nvidia", "nvda", "英偉達", "輝達"],
      AVGO: ["broadcom", "avgo"],
      AMD: ["advanced micro devices", "amd"],
      TSM: ["tsmc", "taiwan semiconductor", "台積電"],
      AAPL: ["apple", "蘋果"],
      MSFT: ["microsoft", "微軟"],
      "0981.HK": ["smic", "中芯"],
    },
    keywords: [
      "semiconductor",
      "foundry",
      "gpu",
      "ai chip",
      "nvidia",
      "tsmc",
      "broadcom",
      "半導體",
      "晶片",
      "英偉達",
      "台積電",
    ],
  },
  {
    id: "china-internet",
    tickers: ["0700.HK", "9988.HK", "3690.HK", "9618.HK", "1810.HK"],
    aliases: {
      "0700.HK": ["tencent", "騰訊"],
      "9988.HK": ["alibaba", "阿里巴巴", "baba"],
      "3690.HK": ["meituan", "美團"],
      "9618.HK": ["jd.com", "京東"],
      "1810.HK": ["xiaomi", "小米"],
    },
    keywords: [
      "china internet",
      "tencent",
      "alibaba",
      "meituan",
      "pdd",
      "xiaomi",
      "中國互聯網",
      "騰訊",
      "阿里",
      "美團",
      "京東",
      "小米",
    ],
  },
  {
    id: "ev",
    tickers: ["TSLA", "1211.HK", "2015.HK", "9866.HK"],
    aliases: {
      TSLA: ["tesla", "特斯拉"],
      "1211.HK": ["byd", "比亞迪"],
      "2015.HK": ["li auto", "理想"],
      "9866.HK": ["nio", "蔚來"],
    },
    keywords: ["electric vehicle", "ev maker", "battery ev", "tesla", "byd", "電動車", "比亞迪", "特斯拉", "電池車"],
  },
  {
    id: "biotech",
    tickers: ["LLY", "NVO", "2269.HK", "1801.HK"],
    aliases: {
      LLY: ["eli lilly", "lilly", "禮來"],
      NVO: ["novo nordisk", "諾和諾德"],
      "2269.HK": ["wuxi biologics", "藥明生物"],
      "1801.HK": ["innovent", "信達"],
    },
    keywords: ["biotech", "pharmaceutical", "fda", "glp-1", "生物科技", "藥廠", "醫藥", "禮來", "信達"],
  },
  {
    id: "consumer",
    tickers: ["COST", "NKE", "2020.HK", "9992.HK"],
    aliases: {
      COST: ["costco", "好市多"],
      NKE: ["nike", "耐克", "耐剋"],
      "2020.HK": ["anta", "安踏"],
      "9992.HK": ["pop mart", "泡泡瑪特"],
    },
    keywords: ["costco", "nike", "luxury retail", "consumer staple", "好市多", "耐克", "安踏", "泡泡瑪特", "奢侈品零售"],
  },
] as const;

export type IndustrySectorId = (typeof INDUSTRY_SECTORS)[number]["id"];

export type HeadlineImpact = "beneficiary" | "at_risk" | "watch";

export interface SectorHeadline {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
  tickers: string[];
}

export interface SectorNameCall {
  ticker: string;
  reason: string;
}

export interface SectorResearch {
  sector: IndustrySectorId;
  date: string;
  locale: "en" | "zh";
  headlines: SectorHeadline[];
  beneficiaries: SectorNameCall[];
  atRisk: SectorNameCall[];
  brief: string[];
  persisted: boolean;
  live: boolean;
}

export function isIndustrySectorId(value: string | null): value is IndustrySectorId {
  return INDUSTRY_SECTORS.some((s) => s.id === value);
}

export function sectorSpec(id: IndustrySectorId) {
  return INDUSTRY_SECTORS.find((s) => s.id === id) ?? INDUSTRY_SECTORS[0];
}

export function hktCalendarDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function publishedDateHkt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return hktCalendarDate(parsed);
}

export function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleHasAlias(title: string, alias: string): boolean {
  const hay = title.toLowerCase();
  const needle = alias.toLowerCase();
  if (/[^\u0000-\u007f]/.test(alias)) return hay.includes(needle);
  if (/^[A-Z0-9.]{1,8}$/i.test(alias) && alias.length <= 5) {
    return new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(title);
  }
  return hay.includes(needle);
}

export function mentionedTickers(title: string, sector: IndustrySectorId): string[] {
  const spec = sectorSpec(sector);
  const found: string[] = [];
  for (const ticker of spec.tickers) {
    const aliases = (spec.aliases as Record<string, readonly string[]>)[ticker] ?? [];
    const hit =
      titleHasAlias(title, ticker) || aliases.some((alias) => titleHasAlias(title, alias));
    if (hit) found.push(ticker);
  }
  return found;
}

export function isSectorRelevant(title: string, sector: IndustrySectorId): boolean {
  if (mentionedTickers(title, sector).length) return true;
  const hay = title.toLowerCase();
  return sectorSpec(sector).keywords.some((word) => hay.includes(word.toLowerCase()));
}

const MACRO =
  /\b(tariff|trade war|export control|sanction|fed\b|interest rate|inflation|oil|brent|crude|war|ceasefire|embargo|ban)\b|關稅|貿易戰|出口管制|制裁|加息|減息|通脹|原油|油價|戰爭|禁令/;

/** General breaking news the desk may map onto a watchlist name even if no ticker is named. */
export function isMacroNews(title: string): boolean {
  return MACRO.test(title);
}

export function keepSectorTape(title: string, sector: IndustrySectorId): boolean {
  return isSectorRelevant(title, sector) || isMacroNews(title);
}

const POSITIVE =
  /\b(beat|surge|soar|rally|win|approve|approval|record|raise|upgrade|order|tariff exemption|deal)\b|上調|獲批|創新高|大增/;
const NEGATIVE =
  /\b(miss|slash|ban|probe|fine|tariff|war|short|downgrade|cut guidance|recall|lawsuit|sanction)\b|下調|制裁|關稅|調查|罰款|禁令/;
const TRADE = /\b(trump|tariff|trade war|china|export control|sanction)\b|特朗普|關稅|貿易|出口管制|制裁/;

/** Keyword tone only — not used to stamp a ticker onto a headline. */
export function classifyHeadline(title: string, locale: "en" | "zh"): { impact: HeadlineImpact; lens: string } {
  const risk = NEGATIVE.test(title);
  const win = POSITIVE.test(title);
  const trade = TRADE.test(title);
  const impact: HeadlineImpact = risk && !win ? "at_risk" : win && !risk ? "beneficiary" : "watch";
  const lens = trade
    ? locale === "zh"
      ? "標題涉及貿易／關稅／地緣政策。"
      : "Headline cites trade / tariff / geopolitical policy."
    : locale === "zh"
      ? "標題關鍵詞語氣，並非板塊研報結論。"
      : "Keyword tone only — not the sector desk note.";
  return { impact, lens };
}

export function parseNameCalls(value: unknown, allowed: readonly string[]): SectorNameCall[] {
  if (!Array.isArray(value)) return [];
  const allow = new Set(allowed);
  const out: SectorNameCall[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const ticker = String(rec.ticker ?? "").trim().toUpperCase();
    const reason = String(rec.reason ?? "").trim();
    if (!allow.has(ticker) || !reason) continue;
    if (out.some((item) => item.ticker === ticker)) continue;
    out.push({ ticker, reason });
  }
  return out.slice(0, 6);
}

export function parseHeadlines(value: unknown): SectorHeadline[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const rec = row as Record<string, unknown>;
      const title = String(rec.title ?? "").trim();
      if (!title) return null;
      const tickers = Array.isArray(rec.tickers)
        ? rec.tickers.map((item) => String(item).trim().toUpperCase()).filter(Boolean)
        : rec.ticker
          ? [String(rec.ticker).trim().toUpperCase()].filter(Boolean)
          : [];
      return {
        title,
        publisher: String(rec.publisher ?? "").trim() || "Wire",
        url: String(rec.url ?? "").trim(),
        publishedAt: rec.publishedAt ? String(rec.publishedAt) : null,
        tickers,
      } satisfies SectorHeadline;
    })
    .filter((row): row is SectorHeadline => row != null)
    .slice(0, 20);
}

export function emptyResearch(
  sector: IndustrySectorId,
  date: string,
  locale: "en" | "zh",
): SectorResearch {
  return {
    sector,
    date,
    locale,
    headlines: [],
    beneficiaries: [],
    atRisk: [],
    brief: [],
    persisted: false,
    live: false,
  };
}

export function hydrateResearch(row: {
  as_of_date: string;
  sector: IndustrySectorId;
  locale: "en" | "zh";
  headlines: unknown;
  beneficiaries: unknown;
  at_risk: unknown;
  brief: unknown;
}): SectorResearch {
  const watchlist = sectorSpec(row.sector).tickers;
  return {
    sector: row.sector,
    date: String(row.as_of_date).slice(0, 10),
    locale: row.locale,
    headlines: parseHeadlines(row.headlines),
    beneficiaries: parseNameCalls(row.beneficiaries, watchlist),
    atRisk: parseNameCalls(row.at_risk, watchlist),
    brief: Array.isArray(row.brief) ? row.brief.map((item) => String(item).trim()).filter(Boolean).slice(0, 5) : [],
    persisted: true,
    live: false,
  };
}
