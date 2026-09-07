import { fetchPrivateDeals } from "@/lib/data/private-market";

export const runtime = "nodejs";

export async function GET() {
  const deals = await fetchPrivateDeals();
  return Response.json({ deals });
}
