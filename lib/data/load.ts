import type { CompanyFinancials } from "@/lib/engines/types";
import { FIXTURE_SEARCH } from "./fixtures";
import { fmpKey } from "./fmp-client";
import { fetchFmpCompany, searchFmp, type SearchHit } from "./fmp";
import { fetchYahooCompany, searchYahoo } from "./yahoo";
import { readCachedFinancials, writeCachedFinancials } from "./cache";
import { isHkTicker, isUsableFinancials, mergeCompanyBooks, normalizeSymbol } from "./normalize";

export async function searchTickers(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 1) return FIXTURE_SEARCH;
  const [fmp, yahoo] = await Promise.all([searchFmp(q), searchYahoo(q)]);
  const fixtures = FIXTURE_SEARCH.filter(
    (f) =>
      f.symbol.toLowerCase().includes(q.toLowerCase()) ||
      f.name.toLowerCase().includes(q.toLowerCase()),
  );
  const merged = new Map<string, SearchHit>();
  for (const hit of [...fixtures, ...fmp, ...yahoo]) {
    const symbol = normalizeSymbol(hit.symbol);
    if (!merged.has(symbol)) merged.set(symbol, { ...hit, symbol });
  }
  return [...merged.values()].slice(0, 8);
}

function alreadyTriedFmp(warnings: string[]): boolean {
  return warnings.some((w) => /filled from Financial Modeling Prep/i.test(w));
}

export async function loadCompany(symbol: string): Promise<CompanyFinancials> {
  const ticker = normalizeSymbol(symbol);
  const cached = await readCachedFinancials(ticker);
  if (cached && cached.source !== "fixture") {
    if (!fmpKey()) return cached;
    if (alreadyTriedFmp(cached.warnings)) return cached;
    if (isHkTicker(ticker) && isUsableFinancials(cached)) return cached;
  }

  const [yahoo, fmp] = await Promise.all([
    cached && cached.source !== "fixture" ? Promise.resolve(cached) : fetchYahooCompany(ticker),
    fetchFmpCompany(ticker),
  ]);
  const live = mergeCompanyBooks(yahoo, fmp);
  if (live && isUsableFinancials(live)) {
    live.warnings = live.warnings.filter((w) => !/FMP backup not available/i.test(w));
    if (!fmp && isHkTicker(ticker)) live.warnings.push("FMP backup not available for this listing.");
    await writeCachedFinancials(live);
    return live;
  }

  if (live) {
    live.warnings.push("Incomplete statements — engines used available fields and conservative defaults.");
    return live;
  }

  throw new Error(
    `No complete financials for ${ticker}. Yahoo or FMP did not return usable statements.`,
  );
}
