import { isHkTicker, normalizeSymbol } from "./normalize";

export const OWNERSHIP_SIGNALS = [
  "INSTITUTIONAL_ACCUMULATION",
  "RETAIL_TRAP",
  "INSIDER_BULLISH",
  "INSIDER_SELLING",
  "NEUTRAL",
] as const;

export type OwnershipSignal = (typeof OWNERSHIP_SIGNALS)[number];
export type OwnershipMarket = "HK" | "US";

export interface OwnershipParty {
  name: string;
  change_30d: string;
}

export interface OwnershipSnapshot {
  ticker: string;
  as_of_date: string;
  market_type: OwnershipMarket;
  institutional_pct: number | null;
  retail_pct: number | null;
  inst_holding_pct: number | null;
  insider_holding_pct: number | null;
  short_interest_pct: number | null;
  net_insider_usd: number | null;
  top_buyers: OwnershipParty[];
  top_sellers: OwnershipParty[];
  signal_type: OwnershipSignal;
}

export function marketFromTicker(ticker: string): OwnershipMarket {
  return isHkTicker(ticker) ? "HK" : "US";
}

export function isOwnershipSignal(value: string): value is OwnershipSignal {
  return (OWNERSHIP_SIGNALS as readonly string[]).includes(value);
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const GENERIC_PARTY =
  /^(insiders|retail brokers|index funds|institutions|smart money|custodians|corporate buyback)$/i;

export function isGenericParty(name: string): boolean {
  return GENERIC_PARTY.test(name.trim());
}

export function namedParties(rows: OwnershipParty[]): OwnershipParty[] {
  return rows.filter((row) => row.name && !isGenericParty(row.name));
}

function parties(value: unknown): OwnershipParty[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const rec = row as Record<string, unknown>;
      const name = String(rec.name ?? "").trim();
      if (!name || isGenericParty(name)) return null;
      const change = rec.change_30d ?? rec.change ?? "";
      return { name, change_30d: String(change) };
    })
    .filter((row): row is OwnershipParty => row != null)
    .slice(0, 10);
}

function dateOnly(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function parseOwnershipRecord(input: unknown): OwnershipSnapshot | { error: string } {
  if (!input || typeof input !== "object") return { error: "Record must be an object." };
  const rec = input as Record<string, unknown>;
  const ticker = normalizeSymbol(String(rec.ticker ?? ""));
  if (!ticker) return { error: "ticker is required." };
  const asOf = dateOnly(rec.as_of_date);
  if (!asOf) return { error: "as_of_date must be YYYY-MM-DD." };
  const signal = String(rec.signal_type ?? "").trim().toUpperCase();
  if (!isOwnershipSignal(signal)) {
    return { error: `signal_type must be one of ${OWNERSHIP_SIGNALS.join(", ")}.` };
  }
  const marketRaw = String(rec.market_type ?? marketFromTicker(ticker)).toUpperCase();
  const market_type: OwnershipMarket = marketRaw === "US" ? "US" : "HK";
  if (market_type === "HK" && (signal === "INSIDER_BULLISH" || signal === "INSIDER_SELLING")) {
    return {
      error:
        "Rejected: HK CCASS snapshots cannot use insider signals. Use INSTITUTIONAL_ACCUMULATION, RETAIL_TRAP, or NEUTRAL from real participant flow.",
    };
  }
  const snapshot: OwnershipSnapshot = {
    ticker,
    as_of_date: asOf,
    market_type,
    institutional_pct: numOrNull(rec.institutional_pct),
    retail_pct: numOrNull(rec.retail_pct),
    inst_holding_pct: numOrNull(rec.inst_holding_pct),
    insider_holding_pct: numOrNull(rec.insider_holding_pct),
    short_interest_pct: numOrNull(rec.short_interest_pct),
    net_insider_usd: numOrNull(rec.net_insider_usd),
    top_buyers: parties(rec.top_buyers),
    top_sellers: parties(rec.top_sellers),
    signal_type: signal,
  };
  const quality = ownershipQualityError(snapshot);
  if (quality) return { error: quality };
  return snapshot;
}

/** Agents writing estimates get a concrete reject reason — same rules as the Postgres trigger. */
export function ownershipQualityError(row: OwnershipSnapshot): string | null {
  const named = [...namedParties(row.top_buyers), ...namedParties(row.top_sellers)];
  if (row.market_type === "HK") {
    if (named.length === 0) {
      return "Rejected: HK snapshot has no real CCASS participant names. Estimated institutional/retail percentages without brokers (Citibank, HSBC, BOCHK, etc.) are not allowed. Scrape https://www3.hkexnews.hk/sdw/search/searchsdw.aspx or POST /api/ownership/ingest with named top_buyers/top_sellers.";
    }
    return null;
  }
  const hasUsFigures =
    row.inst_holding_pct != null ||
    row.insider_holding_pct != null ||
    row.short_interest_pct != null ||
    row.net_insider_usd != null;
  if (named.length === 0 && !hasUsFigures) {
    return "Rejected: US snapshot needs 13F/Form 4 figures (inst_holding_pct, insider_holding_pct, short_interest_pct, or net_insider_usd) or named 13F holders. Estimated institutional_pct/retail_pct alone is not allowed.";
  }
  if (
    (row.signal_type === "INSIDER_BULLISH" || row.signal_type === "INSIDER_SELLING") &&
    row.insider_holding_pct == null &&
    row.net_insider_usd == null
  ) {
    return "Rejected: US insider signal requires insider_holding_pct or net_insider_usd from Form 4, not a guessed label.";
  }
  return null;
}

export function parseIngestBody(input: unknown): OwnershipSnapshot[] | { error: string } {
  const rows = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { records?: unknown }).records)
      ? (input as { records: unknown[] }).records
      : [input];
  const out: OwnershipSnapshot[] = [];
  for (const row of rows) {
    const parsed = parseOwnershipRecord(row);
    if ("error" in parsed) return parsed;
    out.push(parsed);
  }
  if (out.length === 0) return { error: "No records to ingest." };
  return out;
}

export function sortChronological(rows: OwnershipSnapshot[]): OwnershipSnapshot[] {
  return [...rows].sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
}

/** Prefer the newest snapshot that still has real participant names. */
export function latestNamedFlow(snapshots: OwnershipSnapshot[]): {
  buyers: OwnershipParty[];
  sellers: OwnershipParty[];
} {
  for (const row of [...sortChronological(snapshots)].reverse()) {
    const buyers = namedParties(row.top_buyers);
    const sellers = namedParties(row.top_sellers);
    if (buyers.length || sellers.length) return { buyers, sellers };
  }
  return { buyers: [], sellers: [] };
}

export function pctDelta(from: number | null, to: number | null): number | null {
  if (from == null || to == null) return null;
  return to - from;
}

/** Compact facts for the IC / Smart Money LLM. Never invent figures beyond this JSON. */
export function ownershipLlmBrief(snapshots: OwnershipSnapshot[]): string {
  if (snapshots.length === 0) {
    return "No ingested CCASS or 13F snapshots for this ticker.";
  }
  const ordered = sortChronological(snapshots);
  const latest = ordered.at(-1)!;
  const earliest = ordered[0]!;
  return JSON.stringify(
    {
      observations: ordered.length,
      from: earliest.as_of_date,
      to: latest.as_of_date,
      market: latest.market_type,
      signal: latest.signal_type,
      latest: {
        institutional_pct: latest.institutional_pct,
        retail_pct: latest.retail_pct,
        inst_holding_pct: latest.inst_holding_pct,
        insider_holding_pct: latest.insider_holding_pct,
        short_interest_pct: latest.short_interest_pct,
        net_insider_usd: latest.net_insider_usd,
      },
      shift: {
        institutional_pct: pctDelta(earliest.institutional_pct, latest.institutional_pct),
        retail_pct: pctDelta(earliest.retail_pct, latest.retail_pct),
        inst_holding_pct: pctDelta(earliest.inst_holding_pct, latest.inst_holding_pct),
      },
      top_buyers: latestNamedFlow(ordered).buyers.slice(0, 5),
      top_sellers: latestNamedFlow(ordered).sellers.slice(0, 5),
    },
    null,
    2,
  );
}
