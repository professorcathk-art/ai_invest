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
  fromDate?: string;
  windowDays?: number;
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

/** Hong Kong calendar week starts Monday. `as_of_date` for weekly digests is this Monday. */
export function weekStartMonday(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1));
  const dow = utc.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return shiftIsoDate(iso, offset);
}

export function weekEndSunday(weekStart: string): string {
  return shiftIsoDate(weekStartMonday(weekStart), 6);
}

export function tapeEndForWeek(weekStart: string, today = hktCalendarDate()): string {
  const start = weekStartMonday(weekStart);
  const end = weekEndSunday(start);
  if (today < start) return start;
  if (today > end) return end;
  return today;
}

export function inclusiveDays(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function digestWeekStarts(dates: string[], today = hktCalendarDate()): string[] {
  const weeks = new Set(dates.filter(isIsoDate).map(weekStartMonday));
  weeks.add(weekStartMonday(today));
  weeks.add(shiftIsoDate(weekStartMonday(today), -7));
  return [...weeks].sort((left, right) => right.localeCompare(left));
}

export function listingMarket(ticker: string): "US" | "HK" {
  return /\.HK$/i.test(ticker) ? "HK" : "US";
}

export function groupNameCallsByMarket(rows: SectorNameCall[]): { market: "US" | "HK"; rows: SectorNameCall[] }[] {
  const us = rows.filter((row) => listingMarket(row.ticker) === "US");
  const hk = rows.filter((row) => listingMarket(row.ticker) === "HK");
  return [
    ...(us.length ? [{ market: "US" as const, rows: us }] : []),
    ...(hk.length ? [{ market: "HK" as const, rows: hk }] : []),
  ];
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

export function inDateWindow(
  publishedAt: string | null | undefined,
  endDate: string,
  days: number,
  allowUndated: boolean,
): boolean {
  const day = publishedDateHkt(publishedAt);
  if (!day) return allowUndated;
  const start = shiftIsoDate(endDate, -(Math.max(1, days) - 1));
  return day >= start && day <= endDate;
}

/** English UI keeps English wires; Chinese UI keeps 中文 plus English wires the HK desk still reads. */
export function headlineFitsLocale(title: string, locale: "en" | "zh"): boolean {
  const hasCjk = /[\u4e00-\u9fff]/.test(title);
  if (locale === "en") return !hasCjk;
  return true;
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

export function padHkTicker(raw: string): string {
  const match = raw.trim().toUpperCase().match(/^(\d{1,5})\.HK$/);
  if (!match) return raw.trim().toUpperCase();
  return `${match[1]!.padStart(4, "0")}.HK`;
}

export function resolveWatchlistTicker(
  raw: string,
  allowed: readonly string[],
  aliases?: Record<string, readonly string[]>,
): string | null {
  const allow = new Map(allowed.map((ticker) => [ticker.toUpperCase(), ticker]));
  const padded = padHkTicker(raw);
  if (allow.has(padded)) return allow.get(padded) ?? null;
  const hay = raw.trim().toLowerCase().replace(/^\$/, "");
  for (const ticker of allowed) {
    if (ticker.toLowerCase() === hay) return ticker;
    const names = aliases?.[ticker] ?? [];
    if (names.some((alias) => alias.toLowerCase() === hay)) return ticker;
  }
  return null;
}

export function parseNameCalls(
  value: unknown,
  allowed: readonly string[],
  aliases?: Record<string, readonly string[]>,
): SectorNameCall[] {
  if (!Array.isArray(value)) return [];
  const out: SectorNameCall[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const ticker = resolveWatchlistTicker(String(rec.ticker ?? ""), allowed, aliases);
    const reason = String(rec.reason ?? "").trim();
    if (!ticker || !reason) continue;
    if (out.some((item) => item.ticker === ticker)) continue;
    out.push({ ticker, reason });
  }
  return out.slice(0, 6);
}

function pushNameCall(out: SectorNameCall[], ticker: string, reason: string) {
  if (!ticker || !reason) return;
  if (out.some((row) => row.ticker === ticker)) return;
  out.push({ ticker, reason });
}

/** Last-resort mapping when the model returns no names. Still sourced from the tape / sector keywords. */
export function fallbackWatchlistCalls(
  headlines: SectorHeadline[],
  sector: IndustrySectorId,
  locale: "en" | "zh",
): { beneficiaries: SectorNameCall[]; atRisk: SectorNameCall[] } {
  const helped: SectorNameCall[] = [];
  const hurt: SectorNameCall[] = [];
  const watch = new Set<string>([...sectorSpec(sector).tickers]);
  for (const item of headlines) {
    const tone = classifyHeadline(item.title, locale).impact;
    const reason =
      locale === "zh" ? `公開標題：${item.title.slice(0, 90)}` : `Sourced headline: ${item.title.slice(0, 90)}`;
    for (const ticker of item.tickers) {
      if (!watch.has(ticker)) continue;
      if (tone === "at_risk") pushNameCall(hurt, ticker, reason);
      else pushNameCall(helped, ticker, reason);
    }
  }
  const tape = headlines.map((item) => item.title).join("\n");
  const zh = locale === "zh";
  if (!helped.length && !hurt.length) {
    if (sector === "ai" && /export control|gpu|semiconductor|foundry|chip|晶片|半導體|出口管制|台積電/i.test(tape)) {
      pushNameCall(helped, "NVDA", zh ? "本週晶片／算力新聞對GPU龍頭有方向性。" : "Chip / compute tape maps onto the GPU leader.");
      pushNameCall(hurt, "TSM", zh ? "出口管制與地緣風險落在代工鏈。" : "Export-control / geo risk sits on the foundry chain.");
      pushNameCall(helped, "0981.HK", zh ? "內地晶圓廠同屬半導體觀察名單。" : "Mainland foundry stays on the same semiconductor watchlist.");
    }
    if (sector === "consumer" && /oil|brent|crude|inflation|tariff|油價|原油|通脹|關稅/i.test(tape)) {
      pushNameCall(helped, "COST", zh ? "油價與通脹新聞下，倉店零售屬防禦消費。" : "Oil / inflation tape favours the warehouse staple.");
      pushNameCall(hurt, "NKE", zh ? "關稅與消費轉弱更傷可選零售。" : "Tariff / weaker demand pressure discretionary retail.");
    }
    if (sector === "ev" && /tariff|ev|battery|tesla|byd|關稅|電動車|電池/i.test(tape)) {
      pushNameCall(hurt, "TSLA", zh ? "關稅與車價新聞對整車廠有方向性。" : "Tariff / auto tape maps onto the EV makers.");
      pushNameCall(hurt, "1211.HK", zh ? "出口與關稅風險指向內地整車。" : "Export / tariff risk maps onto the HK-listed EV maker.");
    }
    if (sector === "biotech" && /fda|glp-1|drug|pharma|biotech|醫藥|新藥|生物科技/i.test(tape)) {
      pushNameCall(helped, "LLY", zh ? "GLP-1／醫藥要聞仍指向美股龍頭。" : "GLP-1 / pharma tape still maps onto the US leaders.");
      pushNameCall(helped, "NVO", zh ? "同業GLP-1格局仍是本週醫藥主軸。" : "The GLP-1 pair remains the core biotech watch.");
    }
    if (sector === "china-internet" && /china|tencent|alibaba|meituan|互聯網|騰訊|阿里|美團/i.test(tape)) {
      pushNameCall(helped, "0700.HK", zh ? "中國互聯網要聞優先對照騰訊。" : "China-internet tape maps onto the HK internet names.");
      pushNameCall(hurt, "9988.HK", zh ? "監管與消費新聞同時落在阿里。" : "Regulatory / consumer tape also sits on Alibaba.");
    }
  }
  return { beneficiaries: helped.slice(0, 4), atRisk: hurt.slice(0, 4) };
}

export function hasDeskNote(row: Pick<SectorResearch, "brief" | "beneficiaries" | "atRisk">): boolean {
  return row.brief.length > 0 || row.beneficiaries.length > 0 || row.atRisk.length > 0;
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
    .slice(0, 40);
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
    fromDate: date,
    windowDays: 1,
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
  const spec = sectorSpec(row.sector);
  const weekStart = weekStartMonday(String(row.as_of_date).slice(0, 10));
  const aliases = spec.aliases as Record<string, readonly string[]>;
  return {
    sector: row.sector,
    date: weekStart,
    locale: row.locale,
    headlines: parseHeadlines(row.headlines),
    beneficiaries: parseNameCalls(row.beneficiaries, spec.tickers, aliases),
    atRisk: parseNameCalls(row.at_risk, spec.tickers, aliases),
    brief: Array.isArray(row.brief) ? row.brief.map((item) => String(item).trim()).filter(Boolean).slice(0, 5) : [],
    persisted: true,
    live: false,
    fromDate: weekStart,
    windowDays: 7,
  };
}
