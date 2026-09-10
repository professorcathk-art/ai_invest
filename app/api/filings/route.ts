import { listCompanyFilings } from "@/lib/data/filings-store";
import { normalizeSymbol } from "@/lib/data/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ticker = normalizeSymbol(new URL(request.url).searchParams.get("ticker") ?? "");
  if (!ticker) {
    return Response.json({ error: "ticker is required." }, { status: 400 });
  }
  const rows = await listCompanyFilings(ticker, 8);
  return Response.json(
    { ticker, filings: rows },
    { headers: { "Cache-Control": "no-store" } },
  );
}
