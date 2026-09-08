import { normalizeSymbol } from "./normalize";
import {
  marketFromTicker,
  namedParties,
  parseOwnershipRecord,
  type OwnershipSnapshot,
} from "./ownership";
import { listOwnership, upsertOwnership } from "./ownership-store";

function client() {
  return import("yahoo-finance2").then((mod) => new mod.default({ suppressNotices: ["yahooSurvey"] }));
}

function rawNum(node: unknown): number | null {
  if (node == null) return null;
  if (typeof node === "number" && Number.isFinite(node)) return node;
  if (typeof node === "object" && node && "raw" in node) {
    const value = Number((node as { raw?: unknown }).raw);
    return Number.isFinite(value) ? value : null;
  }
  const value = Number(node);
  return Number.isFinite(value) ? value : null;
}

function toPct(value: number | null): number | null {
  if (value == null) return null;
  return value <= 1.5 ? Math.round(value * 10_000) / 100 : Math.round(value * 100) / 100;
}

export function buildYahooOwnershipSnapshot(
  ticker: string,
  block: Record<string, unknown>,
  asOf = new Date().toISOString().slice(0, 10),
): OwnershipSnapshot | null {
  const stats = (block.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const major = (block.majorHoldersBreakdown ?? {}) as Record<string, unknown>;
  const inst = toPct(rawNum(major.institutionsPercentHeld) ?? rawNum(stats.heldPercentInstitutions));
  const insider = toPct(rawNum(major.insidersPercentHeld) ?? rawNum(stats.heldPercentInsiders));
  const shortPct = toPct(rawNum(stats.shortPercentOfFloat));
  const holders =
    ((block.institutionOwnership as { ownershipList?: Array<Record<string, unknown>> } | undefined)
      ?.ownershipList ?? []);
  const buyers: OwnershipSnapshot["top_buyers"] = [];
  const sellers: OwnershipSnapshot["top_sellers"] = [];
  for (const holder of holders) {
    const name = String(holder.organization ?? "").trim();
    const change = rawNum((holder.pctChange as { raw?: unknown }) ?? holder.pctChange);
    if (!name || change == null) continue;
    const item = { name, change_30d: `${(change * (Math.abs(change) <= 1.5 ? 100 : 1)).toFixed(2)}%` };
    if (change > 0) buyers.push(item);
    else if (change < 0) sellers.push(item);
  }
  let net = 0;
  const txns =
    ((block.insiderTransactions as { transactions?: Array<Record<string, unknown>> } | undefined)
      ?.transactions ?? []);
  for (const txn of txns) {
    const text = String(txn.transactionText ?? "").toLowerCase();
    const value = rawNum(txn.value) ?? 0;
    if (text.includes("sale") || text.includes("sell")) net -= value;
    else if (text.includes("purchase") || text.includes("buy")) net += value;
  }
  if (inst == null && insider == null && shortPct == null && buyers.length === 0 && sellers.length === 0) {
    return null;
  }
  let signal: OwnershipSnapshot["signal_type"] = "NEUTRAL";
  if (net > 0) signal = "INSIDER_BULLISH";
  else if (net < 0) signal = "INSIDER_SELLING";
  const parsed = parseOwnershipRecord({
    ticker,
    as_of_date: asOf,
    market_type: "US",
    inst_holding_pct: inst,
    insider_holding_pct: insider,
    short_interest_pct: shortPct,
    net_insider_usd: Math.round(net * 100) / 100,
    top_buyers: buyers.slice(0, 5),
    top_sellers: sellers.slice(0, 5),
    signal_type: signal,
  });
  return "error" in parsed ? null : parsed;
}

/** Live Yahoo 13F / Form 4 / holder tape. Persists as US-style rows (HK CCASS stays on the iMac job). */
export async function refreshLiveOwnership(ticker: string): Promise<OwnershipSnapshot | null> {
  const symbol = normalizeSymbol(ticker);
  try {
    const yf = await client();
    const summary = await yf.quoteSummary(symbol, {
      modules: ["defaultKeyStatistics", "majorHoldersBreakdown", "institutionOwnership", "insiderTransactions"],
    });
    const block = (summary ?? {}) as Record<string, unknown>;
    const snapshot = buildYahooOwnershipSnapshot(symbol, block);
    if (!snapshot) return null;
    const existing = await listOwnership(symbol, 10);
    const sameDayHkCcass = existing.some(
      (row) =>
        row.as_of_date === snapshot.as_of_date &&
        row.market_type === "HK" &&
        (namedParties(row.top_buyers).length > 0 || namedParties(row.top_sellers).length > 0),
    );
    if (!sameDayHkCcass) {
      await upsertOwnership([snapshot]);
    }
    return snapshot;
  } catch {
    return null;
  }
}

export async function refreshThenListOwnership(ticker: string, limit = 30): Promise<OwnershipSnapshot[]> {
  const live = await refreshLiveOwnership(ticker).catch(() => null);
  const listed = await listOwnership(ticker, limit);
  if (!live) return listed;
  if (preferredOwnershipMarket(listed, ticker) === "HK") return listed;
  const already = listed.some((row) => row.as_of_date === live.as_of_date && row.market_type === live.market_type);
  return already ? listed : [live, ...listed].slice(0, limit);
}

export function preferredOwnershipMarket(snapshots: OwnershipSnapshot[], ticker: string) {
  const hasHkCcass = snapshots.some(
    (row) =>
      row.market_type === "HK" &&
      (namedParties(row.top_buyers).length > 0 || namedParties(row.top_sellers).length > 0),
  );
  if (hasHkCcass) return "HK" as const;
  if (snapshots.some((row) => row.market_type === "US")) return "US" as const;
  return marketFromTicker(ticker);
}
