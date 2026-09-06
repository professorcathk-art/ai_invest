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
    expect(dcf.views?.[0]?.showGridLines).not.toBe(false);
    expect((dcf.getCell("B29").value as { formula?: string }).formula).toContain("NPV");
    expect((dcf.getCell("B25").value as { formula?: string }).formula).toContain("$B$5");
    expect((dcf.getCell("B19").value as { formula?: string }).formula).toContain("B11");
    expect((dcf.getCell("B35").value as { formula?: string }).formula).toBe("B33-B7");
    expect((dcf.getCell("B36").value as { formula?: string }).formula).toContain("B34/B8");
    expect((dcf.getCell("B37").value as { formula?: string }).formula).toContain("B35/B8");
    expect(dcf.getCell("B3").font?.color?.argb).toMatch(/0000FF$/);
    expect(dcf.getCell("B29").font?.color?.argb).toMatch(/000000$/);
    expect(dcf.getCell("B11").font?.color?.argb).toMatch(/008000$/);
    expect(dcf.getCell("B3").numFmt).toBe("0.0%");
    expect(dcf.getCell("B6").numFmt).toBe('0.0"x"');
    expect(dcf.getCell("B36").numFmt).toBe("#,##0.00");

    const hist = wb.getWorksheet("3-Statement Historical")!;
    const firstYear = Number(hist.getCell("B3").value);
    expect(firstYear).toBeGreaterThan(1990);
    expect(Number(hist.getCell("B4").value)).toBeGreaterThan(0);
    expect(Number(hist.getCell("B5").value)).toBeGreaterThan(0);
    expect(Number(hist.getCell("B6").value)).toBeGreaterThan(0);

    const lbo = wb.getWorksheet("LBO Model")!;
    expect((lbo.getCell("B21").value as { formula?: string }).formula).toContain("IRR");
    expect((lbo.getCell("B3").value as { formula?: string }).formula).toBe("Summary!B7");
    expect((lbo.getCell("D25").value as { formula?: string }).formula).toBe("C25*$B$5");
    expect((lbo.getCell("G25").value as { formula?: string }).formula).toBe("D25+E25");

    const summary = wb.getWorksheet("Summary")!;
    expect((summary.getCell("B9").value as { formula?: string }).formula).toContain("DCF Valuation'!B36");
  });
});
