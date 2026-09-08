const FMP_STABLE = "https://financialmodelingprep.com/stable";

export function fmpKey(): string | undefined {
  const key = process.env.FMP_API_KEY?.trim();
  return key || undefined;
}

function isErrorPayload(data: unknown): boolean {
  if (data == null) return true;
  if (typeof data === "string") return true;
  if (Array.isArray(data)) return false;
  if (typeof data === "object" && ("Error Message" in data || "error" in data || "Note" in data)) {
    return true;
  }
  return false;
}

/** Current FMP API. Legacy /api/v3 is 403 for keys issued after 31 Aug 2025. */
export async function fmpStable<T = unknown>(path: string): Promise<T | null> {
  const key = fmpKey();
  if (!key) return null;
  const url = `${FMP_STABLE}${path}${path.includes("?") ? "&" : "?"}apikey=${key}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "User-Agent": "InvestMouse/1.0 (research)" },
      });
      if (res.status === 429 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      if (!res.ok) {
        console.warn(`FMP ${path.split("?")[0]} HTTP ${res.status}`);
        return null;
      }
      const body = await res.text();
      if (!body || /premium query|restricted endpoint|legacy endpoint/i.test(body)) return null;
      let data: unknown;
      try {
        data = JSON.parse(body) as unknown;
      } catch {
        return null;
      }
      if (isErrorPayload(data)) return null;
      return data as T;
    } catch {
      if (attempt === 0) continue;
      return null;
    }
  }
  return null;
}
