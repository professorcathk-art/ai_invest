import { fmpStable } from "./fmp-client";

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
  const { fetchPrivateDealHeadlines } = await import("./private-deals-rss");
  const [stable, headlines] = await Promise.all([
    fmpStable("/mergers-acquisitions-latest?page=0"),
    fetchPrivateDealHeadlines("en"),
  ]);
  const deals = [...parsePrivateDeals(stable), ...headlines];
  deals.sort((a, b) => String(b.announcedOn).localeCompare(String(a.announcedOn)));
  const seen = new Set<string>();
  return deals
    .filter((deal) => {
      const key = `${deal.target}|${deal.acquirer}|${deal.announcedOn}|${deal.dealSize}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80);
}
