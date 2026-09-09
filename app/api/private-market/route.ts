import { fetchPrivateDeals } from "@/lib/data/private-market";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const deals = await fetchPrivateDeals();
  return Response.json({ deals });
}
