import { listOwnership } from "@/lib/data/ownership-store";
import { marketFromTicker } from "@/lib/data/ownership";
import { normalizeSymbol } from "@/lib/data/normalize";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ticker = normalizeSymbol(new URL(request.url).searchParams.get("ticker") ?? "");
  if (!ticker) {
    return Response.json({ error: "ticker is required." }, { status: 400 });
  }
  const snapshots = await listOwnership(ticker, 30);
  return Response.json({
    ticker,
    market: snapshots[0]?.market_type ?? marketFromTicker(ticker),
    snapshots,
  });
}
