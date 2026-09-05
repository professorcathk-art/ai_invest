import type { CompanyFinancials } from "@/lib/engines/types";
import { FIXTURE_SEARCH, getFixture } from "./fixtures";
import { fetchFmpCompany, searchFmp, type SearchHit } from "./fmp";
import { fetchYahooCompany, searchYahoo } from "./yahoo";
import { readCachedFinancials, writeCachedFinancials } from "./cache";
import { isUsableFinancials, normalizeSymbol } from "./normalize";

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

export async function loadCompany(symbol: string): Promise<CompanyFinancials> {
  const ticker = normalizeSymbol(symbol);
  const cached = await readCachedFinancials(ticker);
  if (cached) return cached;

  const live = (await fetchFmpCompany(ticker)) ?? (await fetchYahooCompany(ticker));
  if (live && isUsableFinancials(live)) {
    await writeCachedFinancials(live);
    return live;
  }

  const fixture = getFixture(ticker);
  if (fixture) {
    if (live?.quote.price) {
      const last = fixture.years.at(-1);
      const shares = live.quote.sharesOutstanding || fixture.quote.sharesOutstanding;
      const price = live.quote.price;
      const marketCap = price * shares;
      const netDebt = last ? last.totalDebt - last.cash : 0;
      const ev = marketCap + netDebt;
      fixture.quote = {
        ...fixture.quote,
        price,
        sharesOutstanding: shares,
        marketCap,
        enterpriseValue: ev,
        pe: last && last.netIncome ? marketCap / last.netIncome : fixture.quote.pe,
        evEbitda: last && last.ebitda ? ev / last.ebitda : fixture.quote.evEbitda,
        evRevenue: last && last.revenue ? ev / last.revenue : fixture.quote.evRevenue,
      };
      fixture.warnings.push(
        "Live quote applied; statements from demo fixture (Yahoo/FMP incomplete). EV/multiples recomputed from fixture books.",
      );
    }
    return fixture;
  }

  if (live) {
    live.warnings.push("Incomplete statements — engines used available fields and conservative defaults.");
    return live;
  }

  throw new Error(
    `No complete financials for ${ticker}. Try AAPL, NVDA, or 0700.HK, or set FMP_API_KEY.`,
  );
}
