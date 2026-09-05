import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { runEngines } from "@/lib/engines";
import { getFixture } from "@/lib/data/fixtures";
import { defaultSliders } from "@/lib/engines/wacc";
import { buildWorkbook } from "./workbook";

describe("excel export", () => {
  it("writes four IB-formatted sheets with live formulas", async () => {
    const financials = getFixture("AAPL")!;
    const bundle = runEngines(financials, defaultSliders(financials));
    const buffer = await buildWorkbook(bundle);
    expect(buffer.byteLength).toBeGreaterThan(2000);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      "Summary",
      "3-Statement Historical",
      "DCF Valuation",
      "LBO Model",
    ]);
    const dcf = wb.getWorksheet("DCF Valuation")!;
    expect((dcf.getCell("B16").value as { formula?: string }).formula).toContain("NPV");
    const lbo = wb.getWorksheet("LBO Model")!;
    expect((lbo.getCell("B21").value as { formula?: string }).formula).toContain("IRR");
    const summary = wb.getWorksheet("Summary")!;
    expect((summary.getCell("B7").value as { formula?: string }).formula).toContain("DCF Valuation");
  });
});
