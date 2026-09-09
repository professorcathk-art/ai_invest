import { shortSellingLlmBrief, type HkexShortSellingRow } from "./hkex-short-selling";
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

/** Published so Workbuddy / Codex can adjust a rejected payload instead of guessing. */
export function ownershipIngestStandard() {
  return {
    endpoint: "POST /api/ownership/ingest",
    auth: "Authorization: Bearer $RESEARCH_INGEST_TOKEN",
    body: "one record, an array, or { records: [...] }",
    hk: {
      required: ["ticker", "as_of_date", "signal_type", "top_buyers or top_sellers with real CCASS names"],
      fields: {
        ticker: "0700.HK",
        as_of_date: "YYYY-MM-DD from the HKEX shareholding date",
        market_type: "HK",
        signal_type: "INSTITUTIONAL_ACCUMULATION | RETAIL_TRAP | NEUTRAL",
        institutional_pct: "sum of institutional CCASS % (optional if names present)",
        retail_pct: "sum of retail-broker CCASS % (optional if names present)",
        top_buyers: [{ name: "CITIBANK N.A.", change_30d: "+1.22%" }],
        top_sellers: [{ name: "THE HONGKONG AND SHANGHAI BANKING", change_30d: "-0.70%" }],
      },
      forbidden: ["invented % with empty brokers", "Insiders / Retail Brokers / Corporate Buyback as names", "INSIDER_BULLISH on .HK"],
      source: "https://www3.hkexnews.hk/sdw/search/searchsdw.aspx",
    },
    us: {
      required: ["ticker", "as_of_date", "signal_type", "at least one 13F/Form 4 field or named holders"],
      fields: {
        ticker: "AAPL",
        as_of_date: "YYYY-MM-DD",
        market_type: "US",
        signal_type: "INSIDER_BULLISH | INSIDER_SELLING | NEUTRAL",
        inst_holding_pct: 68.5,
        insider_holding_pct: 0.07,
        short_interest_pct: 0.8,
        net_insider_usd: 12000000,
        top_buyers: [{ name: "Vanguard Group Inc", change_30d: "+0.40%" }],
      },
      forbidden: ["institutional_pct/retail_pct only", "insider signal without insider_holding_pct or net_insider_usd"],
      source: "Yahoo quoteSummary modules defaultKeyStatistics, majorHoldersBreakdown, institutionOwnership, insiderTransactions",
    },
    example_ok_hk: {
      ticker: "0700.HK",
      as_of_date: "2026-09-04",
      market_type: "HK",
      signal_type: "NEUTRAL",
      institutional_pct: 71.01,
      retail_pct: 1.86,
      top_buyers: [{ name: "CITIBANK N.A.", change_30d: "+1.22%" }],
      top_sellers: [{ name: "BOCI SECURITIES LTD", change_30d: "-0.21%" }],
    },
    example_ok_us: {
      ticker: "AAPL",
      as_of_date: "2026-06-30",
      market_type: "US",
      signal_type: "NEUTRAL",
      inst_holding_pct: 68.5,
      insider_holding_pct: 0.07,
      short_interest_pct: 0.8,
      net_insider_usd: -2500000,
      top_buyers: [{ name: "Vanguard Group Inc", change_30d: "+0.40%" }],
    },
  };
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

export function hasNamedHkCcass(snapshots: OwnershipSnapshot[]): boolean {
  return snapshots.some(
    (row) =>
      row.market_type === "HK" &&
      (namedParties(row.top_buyers).length > 0 || namedParties(row.top_sellers).length > 0),
  );
}

export function preferredOwnershipMarket(snapshots: OwnershipSnapshot[], ticker: string) {
  if (hasNamedHkCcass(snapshots)) return "HK" as const;
  if (snapshots.some((row) => row.market_type === "US")) return "US" as const;
  return marketFromTicker(ticker);
}

/** Keep official CCASS when present; otherwise show the live Yahoo 13F/holder row. */
export function mergeLiveOwnership(
  listed: OwnershipSnapshot[],
  live: OwnershipSnapshot | null,
  limit = 30,
): OwnershipSnapshot[] {
  if (hasNamedHkCcass(listed)) return listed;
  if (!live) return listed;
  const already = listed.some(
    (row) => row.as_of_date === live.as_of_date && row.market_type === live.market_type,
  );
  return already ? listed : [live, ...listed].slice(0, limit);
}

/** Compact facts for the IC / Smart Money LLM. Never invent figures beyond this JSON. */
export function ownershipLlmBrief(
  snapshots: OwnershipSnapshot[],
  shortSelling?: HkexShortSellingRow | null,
): string {
  const parts: string[] = [];
  if (snapshots.length === 0) {
    parts.push("No ingested CCASS or 13F snapshots for this ticker.");
  } else {
    const ordered = sortChronological(snapshots);
    const latest = ordered.at(-1)!;
    const earliest = ordered[0]!;
    parts.push(
      JSON.stringify(
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
      ),
    );
  }
  const shortBrief = shortSellingLlmBrief(shortSelling);
  if (shortBrief) parts.push(shortBrief);
  return parts.join("\n");
}
