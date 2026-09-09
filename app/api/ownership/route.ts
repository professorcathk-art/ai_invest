import { preferredOwnershipMarket } from "@/lib/data/ownership";
import { listOwnership } from "@/lib/data/ownership-store";
import { refreshThenListOwnership } from "@/lib/data/ownership-live";
import { latestShortSellingRow } from "@/lib/data/hkex-short-selling";
import { listShortSelling } from "@/lib/data/hkex-short-selling-store";
import { isHkTicker, normalizeSymbol } from "@/lib/data/normalize";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = normalizeSymbol(url.searchParams.get("ticker") ?? "");
  if (!ticker) {
    return Response.json({ error: "ticker is required." }, { status: 400 });
  }
  const refresh = url.searchParams.get("refresh") === "1";
  const listed = await listOwnership(ticker, 30);
  const snapshots =
    refresh || listed.length === 0
      ? await refreshThenListOwnership(ticker, 30).catch(() => listed)
      : listed;
  const shortHistory = isHkTicker(ticker) ? await listShortSelling(ticker, 30).catch(() => []) : [];
  return Response.json({
    ticker,
    market: preferredOwnershipMarket(snapshots, ticker),
    snapshots,
    shortSelling: latestShortSellingRow(shortHistory),
    shortSellingHistory: shortHistory,
    liveRefreshed: refresh || listed.length === 0,
  });
}
