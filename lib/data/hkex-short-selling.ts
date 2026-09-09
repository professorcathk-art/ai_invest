import { normalizeSymbol } from "./normalize";

export const SHORT_SELLING_BOARDS = ["MAIN", "GEM"] as const;
export const SHORT_SELLING_SESSIONS = ["DAY_CLOSE", "MORNING_CLOSE"] as const;

export type ShortSellingBoard = (typeof SHORT_SELLING_BOARDS)[number];
export type ShortSellingSession = (typeof SHORT_SELLING_SESSIONS)[number];

export interface HkexShortSellingRow {
  ticker: string;
  as_of_date: string;
  board: ShortSellingBoard;
  session: ShortSellingSession;
  stock_name: string | null;
  short_shares: number;
  short_turnover_hkd: number;
  source_url: string;
}

export interface ParsedShortSellingFile {
  placeholder: boolean;
  as_of_date: string | null;
  board: ShortSellingBoard;
  session: ShortSellingSession;
  unitThousands: boolean;
  rows: HkexShortSellingRow[];
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const SOURCE_INDEX =
  "https://www.hkex.com.hk/eng/stat/smstat/ssturnover/sstoday.htm";

export function hkexCodeToTicker(code: string): string {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return `${digits.padStart(4, "0")}.HK`;
}

export function isPlaceholderShortSelling(text: string): boolean {
  return /will be available after/i.test(text);
}

export function extractPreText(html: string): string {
  const block = html.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i);
  const inner = block?.[1] ?? html;
  return inner
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r\n/g, "\n");
}

function parseTradingDate(text: string): string | null {
  const match = text.match(/TRADING\s+DATE\s*:?\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS[match[2]!.toLowerCase()];
  const year = Number(match[3]);
  if (!Number.isFinite(day) || month == null || !Number.isFinite(year)) return null;
  const iso = new Date(Date.UTC(year, month, day));
  if (iso.getUTCFullYear() !== year || iso.getUTCMonth() !== month || iso.getUTCDate() !== day) {
    return null;
  }
  return iso.toISOString().slice(0, 10);
}

function parseAmount(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function inferBoard(text: string, fallback: ShortSellingBoard): ShortSellingBoard {
  if (/\bGEM\b/i.test(text) && !/MAIN\s+BOARD/i.test(text)) return "GEM";
  if (/MAIN\s+BOARD/i.test(text)) return "MAIN";
  return fallback;
}

function inferSession(text: string, fallback: ShortSellingSession): ShortSellingSession {
  if (/morning close/i.test(text)) return "MORNING_CLOSE";
  if (/day close/i.test(text)) return "DAY_CLOSE";
  return fallback;
}

function skipHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^\d/.test(trimmed)) return false;
  return /code|name of stock|trading date|short selling|main board|turnover|-----|=====|\(\s*\$000\s*\)|^total\b/i.test(
    trimmed,
  );
}

export function parseHkexShortSellingText(
  text: string,
  meta: {
    board?: ShortSellingBoard;
    session?: ShortSellingSession;
    source_url?: string;
  } = {},
): ParsedShortSellingFile {
  const board = inferBoard(text, meta.board ?? "MAIN");
  const session = inferSession(text, meta.session ?? "DAY_CLOSE");
  const source_url = meta.source_url?.trim() || SOURCE_INDEX;
  if (isPlaceholderShortSelling(text)) {
    return { placeholder: true, as_of_date: null, board, session, unitThousands: false, rows: [] };
  }
  const as_of_date = parseTradingDate(text);
  const unitThousands = /\$000|HK\$\s*'000/i.test(text);
  if (!as_of_date) {
    return { placeholder: false, as_of_date: null, board, session, unitThousands, rows: [] };
  }

  const rows: HkexShortSellingRow[] = [];
  for (const rawLine of text.split("\n")) {
    if (skipHeaderLine(rawLine)) continue;
    const match = rawLine.match(/^\s*(\d{1,5})\s+(.+?)\s+([\d,]+)\s+([\d,]+)\s*$/);
    if (!match) continue;
    const ticker = hkexCodeToTicker(match[1]!);
    const shares = parseAmount(match[3]!);
    const turnoverRaw = parseAmount(match[4]!);
    if (!ticker || shares == null || turnoverRaw == null || shares < 0 || turnoverRaw < 0) continue;
    const stock_name = match[2]!.replace(/\s+/g, " ").trim() || null;
    rows.push({
      ticker,
      as_of_date,
      board,
      session,
      stock_name,
      short_shares: Math.round(shares),
      short_turnover_hkd: unitThousands ? turnoverRaw * 1000 : turnoverRaw,
      source_url,
    });
  }
  return { placeholder: false, as_of_date, board, session, unitThousands, rows };
}

function isBoard(value: string): value is ShortSellingBoard {
  return (SHORT_SELLING_BOARDS as readonly string[]).includes(value);
}

function isSession(value: string): value is ShortSellingSession {
  return (SHORT_SELLING_SESSIONS as readonly string[]).includes(value);
}

function dateOnly(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

export function parseShortSellingRecord(input: unknown): HkexShortSellingRow | { error: string } {
  if (!input || typeof input !== "object") return { error: "Record must be an object." };
  const rec = input as Record<string, unknown>;
  const ticker = normalizeSymbol(String(rec.ticker ?? ""));
  if (!ticker.endsWith(".HK")) return { error: "ticker must be a Hong Kong listing (e.g. 0700.HK)." };
  const as_of_date = dateOnly(rec.as_of_date);
  if (!as_of_date) return { error: "as_of_date must be YYYY-MM-DD from the HKEX file." };
  const boardRaw = String(rec.board ?? "MAIN").toUpperCase();
  const sessionRaw = String(rec.session ?? "DAY_CLOSE").toUpperCase();
  if (!isBoard(boardRaw)) return { error: "board must be MAIN or GEM." };
  if (!isSession(sessionRaw)) return { error: "session must be DAY_CLOSE or MORNING_CLOSE." };
  const shares = Number(rec.short_shares);
  const turnover = Number(rec.short_turnover_hkd);
  if (!Number.isFinite(shares) || shares < 0) return { error: "short_shares must be a non-negative number from the HKEX file." };
  if (!Number.isFinite(turnover) || turnover < 0) {
    return { error: "short_turnover_hkd must be a non-negative HKD amount from the HKEX file." };
  }
  const source_url = String(rec.source_url ?? "").trim();
  if (!source_url) return { error: "source_url is required." };
  const name = String(rec.stock_name ?? "").trim();
  return {
    ticker,
    as_of_date,
    board: boardRaw,
    session: sessionRaw,
    stock_name: name || null,
    short_shares: Math.round(shares),
    short_turnover_hkd: turnover,
    source_url,
  };
}

export function parseShortSellingSources(input: unknown): HkexShortSellingRow[] | { error: string } {
  if (!input || typeof input !== "object") return { error: "Body must be an object." };
  const rec = input as Record<string, unknown>;
  if (Array.isArray(rec.records)) {
    const out: HkexShortSellingRow[] = [];
    for (const row of rec.records) {
      const parsed = parseShortSellingRecord(row);
      if ("error" in parsed) return parsed;
      out.push(parsed);
    }
    return out;
  }
  if (!Array.isArray(rec.sources)) return { error: "Provide sources: [{ url, text }] or records: [...]." };
  const out: HkexShortSellingRow[] = [];
  for (const source of rec.sources) {
    if (!source || typeof source !== "object") return { error: "Each source must be an object." };
    const item = source as Record<string, unknown>;
    const raw = String(item.text ?? item.html ?? "");
    const text = extractPreText(raw);
    const parsed = parseHkexShortSellingText(text, {
      board: isBoard(String(item.board ?? "").toUpperCase()) ? (String(item.board).toUpperCase() as ShortSellingBoard) : undefined,
      session: isSession(String(item.session ?? "").toUpperCase())
        ? (String(item.session).toUpperCase() as ShortSellingSession)
        : undefined,
      source_url: String(item.url ?? item.source_url ?? SOURCE_INDEX),
    });
    if (parsed.placeholder) continue;
    if (!parsed.as_of_date) {
      return { error: "HKEX file has no TRADING DATE — it is not a published short-selling table." };
    }
    out.push(...parsed.rows);
  }
  return out;
}

export function preferDayClose(rows: HkexShortSellingRow[]): HkexShortSellingRow[] {
  const byDate = new Map<string, HkexShortSellingRow>();
  for (const row of rows) {
    const cur = byDate.get(row.as_of_date);
    if (!cur || (row.session === "DAY_CLOSE" && cur.session !== "DAY_CLOSE")) {
      byDate.set(row.as_of_date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
}

export function latestShortSellingRow(rows: HkexShortSellingRow[]): HkexShortSellingRow | null {
  return preferDayClose(rows).at(-1) ?? null;
}

export function shortSellingLlmBrief(row: HkexShortSellingRow | null | undefined): string {
  if (row === undefined) return "";
  if (row == null) {
    return "No ingested HKEX short-selling turnover row yet. Official ASHT files publish after day close (~16:00 HKT) and are wiped overnight.";
  }
  return JSON.stringify(
    {
      hkex_short_selling: {
        as_of_date: row.as_of_date,
        session: row.session,
        board: row.board,
        short_shares: row.short_shares,
        short_turnover_hkd: row.short_turnover_hkd,
        note: "Daily short-selling TURNOVER from official HKEX ASHT/MSHT files. This is not US short interest as a percent of float.",
      },
    },
    null,
    2,
  );
}

export function shortSellingIngestStandard() {
  return {
    endpoint: "POST /api/short-selling/ingest",
    auth: "Authorization: Bearer $RESEARCH_INGEST_TOKEN",
    source: SOURCE_INDEX,
    files: {
      day_close_main: "https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/ASHTMAIN.HTM",
      day_close_gem: "https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/ASHTGEM.HTM",
      morning_main: "https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/MSHTMAIN.HTM",
      morning_gem: "https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/MSHTGEM.HTM",
    },
    body: "{ sources: [{ url, text, board, session }] } or { records: [...] }",
    note: "Skip placeholder pages that say the table will be available after the close. Do not invent shares or turnover.",
  };
}
