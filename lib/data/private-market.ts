const FMP_V4 = "https://financialmodelingprep.com/api/v4";
const FMP_STABLE = "https://financialmodelingprep.com/stable";

export interface PrivateDeal {
  id: string;
  announcedOn: string | null;
  target: string;
  acquirer: string;
  sector: string;
  dealType: string;
  dealSize: string;
  leadInvestors: string;
  url: string;
}

function fmpKey(): string | undefined {
  return process.env.FMP_API_KEY;
}

async function fmpJson(url: string): Promise<unknown> {
  const key = fmpKey();
  if (!key) return null;
  try {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}apikey=${key}`, { next: { revalidate: 1_800 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function money(value: unknown): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    return `$${n.toLocaleString("en-US")}`;
  }
  return text(value);
}

export function parsePrivateDeals(raw: unknown): PrivateDeal[] {
  if (!Array.isArray(raw)) return [];
  const deals: PrivateDeal[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const target = text(rec.targetedCompanyName ?? rec.target ?? rec.companyName ?? rec.company);
    const acquirer = text(rec.companyName ?? rec.acquirer ?? rec.buyer ?? rec.acquiredBy);
    if (!target && !acquirer) continue;
    const announcedOn = text(rec.transactionDate ?? rec.acceptedDate ?? rec.publishedDate ?? rec.date) || null;
    const sector = text(rec.industry ?? rec.sector ?? rec.targetedCompanyIndustry);
    const dealType = text(rec.transactionType ?? rec.type ?? rec.dealType) || "M&A";
    const dealSize = money(rec.transactionValue ?? rec.dealSize ?? rec.value);
    const leadInvestors = text(rec.leadInvestors ?? rec.investors ?? rec.advisor);
    deals.push({
      id: text(rec.cik ?? rec.url ?? `${target}-${acquirer}-${announcedOn}`) || `${deals.length}`,
      announcedOn,
      target: target || "—",
      acquirer: acquirer && acquirer !== target ? acquirer : "",
      sector,
      dealType,
      dealSize,
      leadInvestors,
      url: text(rec.url ?? rec.link),
    });
  }
  const seen = new Set<string>();
  return deals.filter((deal) => {
    const key = `${deal.target}|${deal.acquirer}|${deal.announcedOn}|${deal.dealSize}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchPrivateDeals(): Promise<PrivateDeal[]> {
  const [rss, stable] = await Promise.all([
    fmpJson(`${FMP_V4}/mergers-acquisitions-rss-feed?page=0`),
    fmpJson(`${FMP_STABLE}/mergers-acquisitions?page=0`),
  ]);
  const deals = [...parsePrivateDeals(rss), ...parsePrivateDeals(stable)];
  deals.sort((a, b) => String(b.announcedOn).localeCompare(String(a.announcedOn)));
  return deals.slice(0, 80);
}
