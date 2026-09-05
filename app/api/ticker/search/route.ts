import { NextResponse } from "next/server";
import { searchTickers } from "@/lib/data/load";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const results = await searchTickers(q);
  return NextResponse.json({ results });
}
