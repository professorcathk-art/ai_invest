import { fmpStable } from "./fmp-client";
import { mergeSources, sourceLabel, type DealSource } from "./deal-sources";

export interface PrivateDeal {
  id: string;
  announcedOn: string | null;
  target: string;
  acquirer: string;
  sector: string;
  dealType: string;
  dealSize: string;
  valuation?: string;
  leadInvestors: string;
  sources: DealSource[];
  url?: string;
}

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function formatDealSize(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    if (value >= 1_000_000_000) return formatDealSize(`$${(value / 1_000_000_000).toFixed(2)}B`);
    if (value >= 1_000_000) return formatDealSize(`$${(value / 1_000_000).toFixed(2)}M`);
    if (value < 100_000) return "";
    return `$${value.toLocaleString("en-US")}`;
  }
  const raw = text(value);
  const match = raw.match(/\$?\s*([\d.,]+)\s*(billion|bn|b|million|mn|m)?/i);
  if (!match) return raw.startsWith("$") ? raw : raw;
  const n = Number(match[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return raw;
  const unit = (match[2] ?? "").toLowerCase();
  const pretty = Number.isInteger(n) || n >= 10 ? n.toFixed(0) : n.toFixed(1);
  if (unit.startsWith("b") || (!unit && /b\b/i.test(raw))) return `$${pretty}B`;
  if (unit.startsWith("m") || raw.toLowerCase().includes("million")) return `$${pretty}M`;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (!unit && n < 100_000) return "";
  return raw.startsWith("$") ? raw : `$${raw}`;
}

export function extractValuation(text: string): string {
  const before = text.match(
    /(?:valued(?:\s+at)?|valuation(?:\s+of)?|post-?money)\s*(?:of|at|:)?\s*(\$[\d.,]+\s*(?:billion|million|bn|mn|[bm])?)/i,
  );
  if (before) return formatDealSize(before[1]);
  const after = text.match(/(\$[\d.,]+\s*(?:billion|million|bn|mn|[bm])?)\s+(?:valuation|post-?money)/i);
  return after ? formatDealSize(after[1]) : "";
}

export function extractRaiseSize(text: string): string {
  const raised = text.match(/raises?\s+(\$[\d.,]+\s*(?:billion|million|bn|mn|[bm])?)/i);
  if (raised) return formatDealSize(raised[1]);
  const atVal = extractValuation(text);
  const money = [...text.matchAll(/\$[\d.,]+\s*(?:billion|million|bn|mn|[bm])?/gi)].map((row) => formatDealSize(row[0]));
  const unique = money.filter((item, index) => item && money.indexOf(item) === index);
  if (atVal) return unique.find((item) => item !== atVal) ?? "";
  return unique[0] ?? "";
}

export function canonicalizeTarget(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(the|inc|corp|ltd|limited|holdings|group|company|co|plc)\b/g, " ")
    .replace(/\b(ai )?(coding |data labeling |fashion |physical )?start-?ups?\b/g, " ")
    .replace(/\b(reportedly|exclusive)\b/g, " ")
    .replace(/\bai\b/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanCompanyName(value: string): string {
  const cleaned = value
    .replace(/\s+[-–—|:].*$/, "")
    .replace(/^(exclusive|breaking|update|sources?)[:\-–—]\s*/i, "")
    .replace(
      /^(?:(?:an?|the)\s+)?(?:french |us |u\.s\. )?(?:ai |a\.i\. )?(?:coding |data labeling |fashion |physical )?(?:start-?up|company)\s+/i,
      "",
    )
    .replace(/,\s+an?\s+.+$/i, "")
    .replace(/,\s*$/, "")
    .replace(/\s+reportedly\b/i, "")
    .replace(/\s+\((?:SEHK|NYSE|NASDAQ)[^)]*\)/gi, "")
    .replace(/,?\s+(inc|corp|ltd|limited|plc)\.?$/i, "")
    .trim();
  return cleaned.slice(0, 72);
}

const JUNK_TARGET = /^(exclusive|breaking|update|sources?|new|report|startup|start)$/i;
const NOT_A_COMPANY =
  /^(peter thiel|marc andreessen|ben horowitz|elon musk|sam altman|donald trump|warren buffett)$/i;

export function isUsableCompanyName(name: string): boolean {
  if (!name || name === "—" || name.length < 2 || name.length > 64) return false;
  if (JUNK_TARGET.test(name) || NOT_A_COMPANY.test(name)) return false;
  if (/,$/.test(name)) return false;
  if (/^(a16z|andreessen horowitz|sequoia|y combinator|\byc\b)$/i.test(name)) return false;
  if (/\b(start-?up|raises?|acquire|merger|combine with|tracks private)\b/i.test(name) && name.split(/\s+/).length >= 4) {
    return false;
  }
  if (/\b(class a|ordinary shares|common stock|acquisition corp(?:oration)?|rights)\b/i.test(name)) {
    return false;
  }
  if (/\bstart$/i.test(name)) return false;
  return true;
}

const SECTOR_RULES: [RegExp, string][] = [
  [/\b(pharma|biotech|biologics|therapeut|oncolog|fda|glp-?1)/i, "Biotech"],
  [/\b(bank|bancorp|bancshares|fintech|financial|payment|insur|credit)/i, "Financials"],
  [/\b(semiconductor|chip|foundry|gpu)\b/i, "Semiconductors"],
  [/\b(artificial intelligence|machine learning|openai|llm)\b|\ba\.i\b|\bai\b/i, "Artificial Intelligence"],
  [/\b(data center|cloud|saas|software|cyber)\b/i, "Enterprise Software"],
  [/\b(electric vehicle|\bev\b|battery|autonomous|robotaxi)\b/i, "Electric Vehicles"],
  [/\b(crypto|bitcoin|blockchain|stablecoin)\b/i, "Crypto"],
  [/\b(defense|firearm|aerospace|munition)\b/i, "Defense"],
  [/\b(e-?commerce|retail|consumer|fashion|luxury)\b/i, "Consumer"],
  [/\b(energy|oil|gas|nuclear|solar)\b/i, "Energy"],
  [/\b(telecom|communications|satellite|5g)\b/i, "Telecom"],
  [/\b(tunnel|infrastructure|construction|boring)\b/i, "Infrastructure"],
];

export function inferDealSector(current = "", ...context: string[]): string {
  const blob = [current, ...context].filter(Boolean).join(" ");
  if (!blob.trim()) return "";
  for (const [pattern, label] of SECTOR_RULES) {
    if (pattern.test(blob)) return label;
  }
  return current.trim();
}

export function dealKey(deal: Pick<PrivateDeal, "target" | "acquirer" | "announcedOn">): string {
  const day = (deal.announcedOn ?? "").slice(0, 10);
  const target = canonicalizeTarget(deal.target);
  const buyer = canonicalizeTarget(deal.acquirer);
  if (target && buyer) return `${[target, buyer].sort().join("+")}|${day}`;
  return `${target}|${day}`;
}

function sameCompany(left: string, right: string): boolean {
  const a = canonicalizeTarget(left);
  const b = canonicalizeTarget(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(long);
}

export function looksUndigested(rows: PrivateDeal[]): boolean {
  if (!rows.length) return true;
  const messy = rows.filter((row) => !isUsableCompanyName(row.target)).length;
  return messy >= Math.max(1, Math.ceil(rows.length * 0.15));
}

export function isFreshDeal(deal: PrivateDeal, now = new Date()): boolean {
  const hasWire = deal.sources.some((source) => source.label !== "SEC");
  const day = deal.announcedOn?.slice(0, 10);
  if (!day) return hasWire;
  const age = (now.getTime() - new Date(`${day}T00:00:00Z`).getTime()) / 86_400_000;
  return hasWire ? age <= 180 : age <= 90;
}

export function parsePrivateDeals(raw: unknown): PrivateDeal[] {
  if (!Array.isArray(raw)) return [];
  const deals: PrivateDeal[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const target = cleanCompanyName(text(rec.targetedCompanyName ?? rec.target ?? rec.company));
    const acquirer = cleanCompanyName(text(rec.acquirer ?? rec.buyer ?? rec.acquiredBy ?? rec.companyName));
    if (!isUsableCompanyName(target) && !isUsableCompanyName(acquirer)) continue;
    const announcedOn = text(rec.transactionDate ?? rec.acceptedDate ?? rec.publishedDate ?? rec.date) || null;
    const url = text(rec.url ?? rec.link);
    const sources = Array.isArray(rec.sources)
      ? mergeSources(
          rec.sources.map((item) => {
            if (!item || typeof item !== "object") return null;
            const src = item as Record<string, unknown>;
            return { label: text(src.label), url: text(src.url) };
          }),
        )
      : url
        ? [{ label: sourceLabel(url, text(rec.publisher)), url }]
        : [];
    deals.push({
      id: text(rec.cik ?? rec.id ?? `${target}-${acquirer}-${announcedOn}`) || `${deals.length}`,
      announcedOn,
      target: isUsableCompanyName(target) ? target : acquirer,
      acquirer: acquirer && !sameCompany(acquirer, target) ? acquirer : "",
      sector: inferDealSector(text(rec.industry ?? rec.sector ?? rec.targetedCompanyIndustry), target, acquirer),
      dealType: text(rec.transactionType ?? rec.type ?? rec.dealType) || "M&A",
      dealSize: formatDealSize(rec.transactionValue ?? rec.dealSize ?? rec.value) || extractRaiseSize(text(rec.title)),
      valuation: formatDealSize(rec.valuation ?? rec.postMoney) || extractValuation(text(rec.title)),
      leadInvestors: text(rec.leadInvestors ?? rec.investors ?? rec.advisor),
      sources,
      url: sources[0]?.url ?? url,
    });
  }
  return mergeDealRows(deals);
}

function preferTargetName(left: string, right: string): string {
  const a = cleanCompanyName(left);
  const b = cleanCompanyName(right);
  if (!isUsableCompanyName(a)) return isUsableCompanyName(b) ? b : a;
  if (!isUsableCompanyName(b)) return a;
  return a.length <= b.length ? a : b;
}

function pickPairNames(cur: PrivateDeal, next: PrivateDeal): { target: string; acquirer: string } {
  const names = [cur.target, next.target, cur.acquirer, next.acquirer]
    .map(cleanCompanyName)
    .filter(isUsableCompanyName);
  const unique: string[] = [];
  for (const name of names) {
    if (unique.some((item) => sameCompany(item, name))) continue;
    unique.push(name);
  }
  const target = preferTargetName(unique[0] ?? cur.target, unique[1] ?? "");
  const acquirer = unique.find((name) => !sameCompany(name, target)) ?? "";
  return { target, acquirer };
}

function combineDeals(cur: PrivateDeal, next: PrivateDeal): PrivateDeal {
  const names = pickPairNames(cur, next);
  return {
    ...cur,
    ...names,
    sector: inferDealSector(cur.sector || next.sector, names.target, names.acquirer),
    dealType: cur.dealType && cur.dealType !== "M&A / funding" ? cur.dealType : next.dealType || cur.dealType,
    dealSize: formatDealSize(cur.dealSize) || formatDealSize(next.dealSize),
    valuation: formatDealSize(cur.valuation) || formatDealSize(next.valuation),
    leadInvestors: cur.leadInvestors || next.leadInvestors,
    sources: mergeSources([...cur.sources, ...next.sources]),
    announcedOn: cur.announcedOn || next.announcedOn,
    url: cur.url || next.url,
  };
}

function nearbyDay(left: string | null, right: string | null): boolean {
  const a = (left ?? "").slice(0, 10);
  const b = (right ?? "").slice(0, 10);
  if (!a || !b) return a === b;
  const delta = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return delta <= 2 * 86_400_000;
}

function findMergeKey(byKey: Map<string, PrivateDeal>, deal: PrivateDeal): string | null {
  const direct = dealKey(deal);
  if (byKey.has(direct)) return direct;
  for (const [key, cur] of byKey) {
    const close = nearbyDay(cur.announcedOn, deal.announcedOn);
    if (!close) continue;
    if (sameCompany(cur.target, deal.target) || (cur.acquirer && deal.acquirer && sameCompany(cur.acquirer, deal.target))) {
      return key;
    }
    if (cur.sources.some((source) => deal.sources.some((other) => other.url === source.url))) return key;
  }
  return null;
}

export function mergeDealRows(rows: PrivateDeal[]): PrivateDeal[] {
  const byKey = new Map<string, PrivateDeal>();
  for (const deal of rows) {
    const target = cleanCompanyName(deal.target);
    if (!isUsableCompanyName(target)) continue;
    const normalized = {
      ...deal,
      target,
      acquirer: cleanCompanyName(deal.acquirer),
      sources: mergeSources(deal.sources),
      dealSize: formatDealSize(deal.dealSize),
      valuation: formatDealSize(deal.valuation),
      sector: inferDealSector(deal.sector, target, cleanCompanyName(deal.acquirer)),
    };
    const existingKey = findMergeKey(byKey, normalized);
    if (!existingKey) {
      byKey.set(dealKey(normalized), normalized);
      continue;
    }
    const combined = combineDeals(byKey.get(existingKey)!, normalized);
    byKey.delete(existingKey);
    byKey.set(dealKey(combined), combined);
  }
  return [...byKey.values()].sort((a, b) => String(b.announcedOn).localeCompare(String(a.announcedOn)));
}

export function keepDisplayDeals(rows: PrivateDeal[]): PrivateDeal[] {
  return mergeDealRows(rows).filter((row) => isFreshDeal(row) && isUsableCompanyName(row.target));
}

export async function fetchPrivateDeals(): Promise<PrivateDeal[]> {
  const { listPrivateDeals, upsertPrivateDeals } = await import("./private-deals-store");
  const { collectDealHeadlines } = await import("./private-deals-rss");
  const { digestDealTape } = await import("@/lib/llm/private-deals");
  const stored = await listPrivateDeals();
  if (stored.length) return stored.slice(0, 80);

  const [stable, headlines] = await Promise.all([
    fmpStable("/mergers-acquisitions-latest?page=0"),
    collectDealHeadlines("en"),
  ]);
  const fmp = parsePrivateDeals(stable);
  const digested = await digestDealTape(headlines, fmp);
  const merged = keepDisplayDeals([...fmp, ...digested]).slice(0, 80);
  if (merged.length) await upsertPrivateDeals(merged);
  return merged;
}
