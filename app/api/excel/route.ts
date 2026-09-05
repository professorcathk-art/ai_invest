import { runEngines, type SliderAssumptions } from "@/lib/engines";
import type { CompanyFinancials } from "@/lib/engines/types";
import { buildWorkbook } from "@/lib/excel/workbook";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    financials: CompanyFinancials;
    sliders: SliderAssumptions;
  };
  const bundle = runEngines(body.financials, body.sliders);
  const buffer = await buildWorkbook(bundle);
  const ticker = bundle.financials.quote.ticker;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PersonaVal_${ticker}.xlsx"`,
    },
  });
}
