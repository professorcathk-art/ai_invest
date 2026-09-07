export const RECENT_TICKERS_KEY = "investmouse.recentTickers";
export const MAX_RECENT_TICKERS = 8;

export function readRecentTickers(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_TICKERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim().toUpperCase())
      .slice(0, MAX_RECENT_TICKERS);
  } catch {
    return [];
  }
}

export function pushRecentTicker(symbol: string): string[] {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) return readRecentTickers();
  const next = [ticker, ...readRecentTickers().filter((item) => item !== ticker)].slice(
    0,
    MAX_RECENT_TICKERS,
  );
  try {
    window.localStorage.setItem(RECENT_TICKERS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("investmouse-recent"));
  } catch {
    // Private mode / quota — history is optional.
  }
  return next;
}
