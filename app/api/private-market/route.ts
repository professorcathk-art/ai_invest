import { fetchPrivateDeals } from "@/lib/data/private-market";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const deals = await fetchPrivateDeals();
  return Response.json(
    { deals },
    { headers: { "Cache-Control": "no-store" } },
  );
}
