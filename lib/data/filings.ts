export type FilingDocType = "annual_report" | "10-k" | "20-f" | "interim";

export interface CompanyFiling {
  ticker: string;
  fiscalYear: number;
  docType: FilingDocType;
  title: string;
  sourceUrl: string;
  storagePath: string;
  publicUrl: string;
  excerpt: string;
  bytes: number;
  fetchedAt: string | null;
}

const DOC_TYPES = new Set<FilingDocType>(["annual_report", "10-k", "20-f", "interim"]);

export function isFilingDocType(value: string): value is FilingDocType {
  return DOC_TYPES.has(value as FilingDocType);
}

export function filingLabel(row: CompanyFiling, locale: "en" | "zh" = "en"): string {
  const year = row.fiscalYear || "";
  if (locale === "zh") {
    if (row.docType === "interim") return `${year} 中期報告`;
    if (row.docType === "10-k") return `${year} 年報（10-K）`;
    if (row.docType === "20-f") return `${year} 年報（20-F）`;
    return `${year} 年報`;
  }
  if (row.docType === "interim") return `${year} interim report`;
  if (row.docType === "10-k") return `${year} annual report (10-K)`;
  if (row.docType === "20-f") return `${year} annual report (20-F)`;
  return `${year} annual report`;
}

export function filingExcerptBrief(rows: CompanyFiling[], limit = 12_000): string {
  const picked = rows.find((row) => row.excerpt.trim()) ?? rows[0];
  if (!picked?.excerpt.trim()) return "";
  const text = picked.excerpt.replace(/\s+/g, " ").trim().slice(0, limit);
  return `${picked.fiscalYear} ${picked.docType}: ${text}`;
}
