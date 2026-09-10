import { ingestAuthorized } from "@/lib/api/ingest-auth";
import { isFilingDocType } from "@/lib/data/filings";
import { upsertCompanyFiling } from "@/lib/data/filings-store";
import { normalizeSymbol } from "@/lib/data/normalize";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    message: "POST metadata after the iMac job uploads the PDF to the company-filings bucket.",
    body: {
      ticker: "0700.HK",
      fiscalYear: 2025,
      docType: "annual_report",
      title: "2025 Annual Report",
      sourceUrl: "https://www1.hkexnews.hk/...",
      storagePath: "0700.HK/2025-annual_report.pdf",
      publicUrl: "https://....supabase.co/storage/v1/object/public/company-filings/...",
      excerpt: "optional text extract",
      bytes: 0,
    },
  });
}

export async function POST(request: Request) {
  if (!process.env.RESEARCH_INGEST_TOKEN?.trim()) {
    return Response.json({ error: "RESEARCH_INGEST_TOKEN is not set." }, { status: 503 });
  }
  if (!ingestAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const ticker = normalizeSymbol(String(body.ticker ?? ""));
  const fiscalYear = Number(body.fiscalYear ?? body.fiscal_year);
  const docType = String(body.docType ?? body.doc_type ?? "");
  const publicUrl = String(body.publicUrl ?? body.public_url ?? "").trim();
  if (!ticker || !Number.isFinite(fiscalYear) || !isFilingDocType(docType) || !publicUrl) {
    return Response.json({ error: "ticker, fiscalYear, docType, and publicUrl are required." }, { status: 400 });
  }

  const result = await upsertCompanyFiling({
    ticker,
    fiscalYear,
    docType,
    title: String(body.title ?? "").trim(),
    sourceUrl: String(body.sourceUrl ?? body.source_url ?? "").trim(),
    storagePath: String(body.storagePath ?? body.storage_path ?? "").trim(),
    publicUrl,
    excerpt: String(body.excerpt ?? ""),
    bytes: Number(body.bytes ?? 0) || 0,
    fetchedAt: null,
  });
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 503 });
  }
  return Response.json({ ok: true, ticker, fiscalYear, docType });
}
