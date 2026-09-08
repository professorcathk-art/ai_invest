import { listOwnership } from "@/lib/data/ownership-store";
import { preferredOwnershipMarket, refreshThenListOwnership } from "@/lib/data/ownership-live";
import { normalizeSymbol } from "@/lib/data/normalize";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = normalizeSymbol(url.searchParams.get("ticker") ?? "");
  if (!ticker) {
    return Response.json({ error: "ticker is required." }, { status: 400 });
  }
  const refresh = url.searchParams.get("refresh") === "1";
  const snapshots = refresh
    ? await refreshThenListOwnership(ticker, 30).catch(() => listOwnership(ticker, 30))
    : await listOwnership(ticker, 30);
  return Response.json({
    ticker,
    market: preferredOwnershipMarket(snapshots, ticker),
    snapshots,
    liveRefreshed: refresh,
  });
}
