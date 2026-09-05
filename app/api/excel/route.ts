import { runEngines } from "@/lib/engines";
import { buildWorkbook } from "@/lib/excel/workbook";
import { readEnginePayload } from "@/lib/api/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = await readEnginePayload(request);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const bundle = runEngines(parsed.financials, parsed.sliders);
  const buffer = await buildWorkbook(bundle);
  const ticker = bundle.financials.quote.ticker;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PersonaVal_${ticker}.xlsx"`,
    },
  });
}
