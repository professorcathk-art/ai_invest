import ExcelJS from "exceljs";
import type { EngineBundle } from "@/lib/engines/types";

const BLUE = "0000FF";
const BLACK = "000000";
const GREEN = "008000";
const HEADER = "111827";
const HEADER_FONT = "F9FAFB";
const INPUT_FILL = "EEF2FF";
const SECTION = "10B981";

function input(cell: ExcelJS.Cell, value: number | string) {
  cell.value = value;
  cell.font = { color: { argb: BLUE }, name: "Calibri", size: 11 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT_FILL } };
  cell.numFmt = typeof value === "number" ? "#,##0.00" : "@";
}

function formula(cell: ExcelJS.Cell, formulaText: string, result: number, format = "#,##0.00") {
  cell.value = { formula: formulaText, result };
  cell.font = { color: { argb: BLACK }, name: "Calibri", size: 11 };
  cell.numFmt = format;
}

function link(cell: ExcelJS.Cell, formulaText: string, result: number | string, format = "#,##0.00") {
  cell.value = typeof result === "string" ? { formula: formulaText, result } : { formula: formulaText, result };
  cell.font = { color: { argb: GREEN }, name: "Calibri", size: 11 };
  cell.numFmt = typeof result === "number" ? format : "@";
}

function label(cell: ExcelJS.Cell, text: string, bold = false) {
  cell.value = text;
  cell.font = { bold, name: "Calibri", size: 11, color: { argb: "111827" } };
}

function headerRow(sheet: ExcelJS.Worksheet, row: number, values: string[], cols: number[]) {
  values.forEach((v, i) => {
    const cell = sheet.getCell(row, cols[i] ?? i + 1);
    cell.value = v;
    cell.font = { bold: true, color: { argb: HEADER_FONT }, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER } };
  });
}

function section(sheet: ExcelJS.Worksheet, cellAddr: string, text: string) {
  const cell = sheet.getCell(cellAddr);
  cell.value = text;
  cell.font = { bold: true, color: { argb: SECTION }, name: "Calibri", size: 14 };
}

export async function buildWorkbook(bundle: EngineBundle): Promise<Buffer> {
  const { financials, sliders, dcf, lbo, vc } = bundle;
  const wb = new ExcelJS.Workbook();
  wb.creator = "PersonaVal";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  const hist = wb.addWorksheet("3-Statement Historical");
  const dcfSheet = wb.addWorksheet("DCF Valuation");
  const lboSheet = wb.addWorksheet("LBO Model");

  for (const ws of [summary, hist, dcfSheet, lboSheet]) {
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.properties.defaultColWidth = 16;
  }

  // --- Assumptions live on DCF (blue) so other sheets can link ---
  section(dcfSheet, "A1", "DCF Valuation");
  label(dcfSheet.getCell("A3"), "WACC", true);
  input(dcfSheet.getCell("B3"), sliders.wacc);
  dcfSheet.getCell("B3").numFmt = "0.00%";
  label(dcfSheet.getCell("A4"), "Terminal growth");
  input(dcfSheet.getCell("B4"), sliders.terminalGrowth);
  dcfSheet.getCell("B4").numFmt = "0.00%";
  label(dcfSheet.getCell("A5"), "Tax rate");
  input(dcfSheet.getCell("B5"), financials.defaults.taxRate);
  dcfSheet.getCell("B5").numFmt = "0.00%";
  label(dcfSheet.getCell("A6"), "Exit multiple");
  input(dcfSheet.getCell("B6"), sliders.exitMultiple);
  dcfSheet.getCell("B6").numFmt = "0.00x";
  label(dcfSheet.getCell("A7"), "Net debt");
  input(dcfSheet.getCell("B7"), dcf.netDebt);
  dcfSheet.getCell("B7").numFmt = "#,##0";
  label(dcfSheet.getCell("A8"), "Shares");
  input(dcfSheet.getCell("B8"), financials.quote.sharesOutstanding);
  dcfSheet.getCell("B8").numFmt = "#,##0";

  headerRow(dcfSheet, 10, ["", "Y1", "Y2", "Y3", "Y4", "Y5"], [1, 2, 3, 4, 5, 6]);
  label(dcfSheet.getCell("A11"), "Projected UFCF");
  dcf.projectedUfcf.forEach((v, i) => {
    input(dcfSheet.getCell(11, i + 2), v);
    dcfSheet.getCell(11, i + 2).numFmt = "#,##0";
  });
  label(dcfSheet.getCell("A12"), "Projected EBITDA");
  dcf.projectedEbitda.forEach((v, i) => {
    input(dcfSheet.getCell(12, i + 2), v);
    dcfSheet.getCell(12, i + 2).numFmt = "#,##0";
  });

  label(dcfSheet.getCell("A14"), "TV (Gordon)", true);
  formula(dcfSheet.getCell("B14"), "IF(B3>B4,F11*(1+B4)/(B3-B4),F11*20)", dcf.terminalValueGordon, "#,##0");
  label(dcfSheet.getCell("A15"), "TV (Exit multiple)");
  formula(dcfSheet.getCell("B15"), "F12*B6", dcf.terminalValueExit, "#,##0");
  label(dcfSheet.getCell("A16"), "PV explicit CFs");
  formula(dcfSheet.getCell("B16"), "NPV(B3,B11:F11)", dcf.pvExplicitGordon, "#,##0");
  label(dcfSheet.getCell("A17"), "PV TV Gordon");
  formula(dcfSheet.getCell("B17"), "B14/(1+B3)^5", dcf.pvTerminalGordon, "#,##0");
  label(dcfSheet.getCell("A18"), "PV TV Exit");
  formula(dcfSheet.getCell("B18"), "B15/(1+B3)^5", dcf.pvTerminalExit, "#,##0");
  label(dcfSheet.getCell("A19"), "Enterprise value (Gordon)", true);
  formula(dcfSheet.getCell("B19"), "B16+B17", dcf.enterpriseValueGordon, "#,##0");
  label(dcfSheet.getCell("A20"), "Enterprise value (Exit)");
  formula(dcfSheet.getCell("B20"), "B16+B18", dcf.enterpriseValueExit, "#,##0");
  label(dcfSheet.getCell("A21"), "Equity value (Gordon)");
  formula(dcfSheet.getCell("B21"), "B19-B7", dcf.equityValueGordon, "#,##0");
  label(dcfSheet.getCell("A22"), "Implied price (Gordon)", true);
  formula(dcfSheet.getCell("B22"), "B21/B8", dcf.impliedPriceGordon, "$#,##0.00");
  label(dcfSheet.getCell("A23"), "Implied price (Exit)");
  formula(dcfSheet.getCell("B23"), "(B20-B7)/B8", dcf.impliedPriceExit, "$#,##0.00");

  // --- Historicals ---
  section(hist, "A1", "3-Statement Historical");
  const years = financials.years;
  headerRow(hist, 3, ["Line item", ...years.map((y) => String(y.year))], [1, 2, 3, 4, 5, 6]);
  const rows: Array<[string, (y: (typeof years)[number]) => number, string]> = [
    ["Revenue", (y) => y.revenue, "revenue"],
    ["Gross profit", (y) => y.grossProfit, "gp"],
    ["EBIT", (y) => y.ebit, "ebit"],
    ["D&A", (y) => y.da, "da"],
    ["EBITDA", (y) => y.ebitda, "ebitda"],
    ["CapEx", (y) => y.capex, "capex"],
    ["ΔNWC", (y) => y.deltaNwc, "nwc"],
    ["FCF / UFCF", (y) => y.fcf, "fcf"],
    ["Net income", (y) => y.netIncome, "ni"],
    ["Total debt", (y) => y.totalDebt, "debt"],
    ["Cash", (y) => y.cash, "cash"],
    ["Equity", (y) => y.equity, "eq"],
  ];
  rows.forEach(([name, getter], idx) => {
    const r = 4 + idx;
    label(hist.getCell(r, 1), name, name === "EBITDA" || name === "FCF / UFCF");
    years.forEach((y, c) => {
      if (name === "EBITDA") {
        formula(hist.getCell(r, c + 2), `${col(c + 2)}6+${col(c + 2)}7`, getter(y), "#,##0");
      } else {
        input(hist.getCell(r, c + 2), getter(y));
        hist.getCell(r, c + 2).numFmt = "#,##0";
      }
    });
  });
  hist.getColumn(1).width = 22;

  // --- LBO ---
  section(lboSheet, "A1", "LBO Model");
  label(lboSheet.getCell("A3"), "Entry EV", true);
  input(lboSheet.getCell("B3"), lbo.entryEv);
  lboSheet.getCell("B3").numFmt = "#,##0";
  label(lboSheet.getCell("A4"), "Debt %");
  input(lboSheet.getCell("B4"), sliders.debtPct);
  lboSheet.getCell("B4").numFmt = "0.0%";
  label(lboSheet.getCell("A5"), "Interest rate");
  input(lboSheet.getCell("B5"), lbo.interestRate);
  lboSheet.getCell("B5").numFmt = "0.0%";
  label(lboSheet.getCell("A6"), "Annual paydown");
  input(lboSheet.getCell("B6"), lbo.paydownRate);
  lboSheet.getCell("B6").numFmt = "0.0%";
  label(lboSheet.getCell("A7"), "Exit multiple");
  input(lboSheet.getCell("B7"), lbo.exitMultiple);
  lboSheet.getCell("B7").numFmt = "0.00x";
  label(lboSheet.getCell("A8"), "Entry EBITDA");
  input(lboSheet.getCell("B8"), lbo.entryEbitda);
  lboSheet.getCell("B8").numFmt = "#,##0";
  label(lboSheet.getCell("A9"), "Y5 EBITDA (base)");
  input(lboSheet.getCell("B9"), lbo.base.years.at(-1)?.ebitda ?? 0);
  lboSheet.getCell("B9").numFmt = "#,##0";

  label(lboSheet.getCell("A11"), "Entry debt");
  formula(lboSheet.getCell("B11"), "B3*B4", lbo.entryDebt, "#,##0");
  label(lboSheet.getCell("A12"), "Entry equity");
  formula(lboSheet.getCell("B12"), "B3-B11", lbo.entryEquity, "#,##0");
  label(lboSheet.getCell("A13"), "Ending debt Y5");
  formula(lboSheet.getCell("B13"), "B11*(1-B6)^5", lbo.base.endingDebt, "#,##0");
  label(lboSheet.getCell("A14"), "Exit EV");
  formula(lboSheet.getCell("B14"), "B9*B7", lbo.base.exitEv, "#,##0");
  label(lboSheet.getCell("A15"), "Exit equity", true);
  formula(lboSheet.getCell("B15"), "B14-B13", lbo.base.exitEquity, "#,##0");
  label(lboSheet.getCell("A16"), "MoIC");
  formula(lboSheet.getCell("B16"), "IF(B12=0,0,B15/B12)", lbo.base.moic, "0.00x");

  label(lboSheet.getCell("A18"), "Equity cash flows", true);
  headerRow(lboSheet, 19, ["", "Y0", "Y1", "Y2", "Y3", "Y4", "Y5"], [1, 2, 3, 4, 5, 6, 7]);
  label(lboSheet.getCell("A20"), "CF");
  formula(lboSheet.getCell("B20"), "-B12", -lbo.entryEquity, "#,##0");
  for (const colIdx of [3, 4, 5, 6]) {
    input(lboSheet.getCell(20, colIdx), 0);
    lboSheet.getCell(20, colIdx).numFmt = "#,##0";
  }
  formula(lboSheet.getCell("G20"), "B15", lbo.base.exitEquity, "#,##0");
  label(lboSheet.getCell("A21"), "IRR (5-year)", true);
  formula(lboSheet.getCell("B21"), "IRR(B20:G20)", lbo.base.irr, "0.0%");
  label(lboSheet.getCell("A22"), "IRR check (MoIC^(1/5)-1)");
  formula(lboSheet.getCell("B22"), "B16^(1/5)-1", lbo.base.irr, "0.0%");

  headerRow(lboSheet, 24, ["Year", "EBITDA", "Opening debt", "Interest", "Principal", "Ending debt"], [1, 2, 3, 4, 5, 6]);
  lbo.base.years.forEach((yr, i) => {
    const r = 25 + i;
    input(lboSheet.getCell(r, 1), yr.year);
    input(lboSheet.getCell(r, 2), yr.ebitda);
    if (i === 0) {
      formula(lboSheet.getCell(r, 3), "$B$11", yr.openingDebt, "#,##0");
    } else {
      formula(lboSheet.getCell(r, 3), `F${r - 1}`, yr.openingDebt, "#,##0");
    }
    formula(lboSheet.getCell(r, 4), `C${r}*$B$5`, yr.interest, "#,##0");
    formula(lboSheet.getCell(r, 5), `C${r}*$B$6`, yr.principal, "#,##0");
    formula(lboSheet.getCell(r, 6), `C${r}-E${r}`, yr.endingDebt, "#,##0");
    lboSheet.getCell(r, 2).numFmt = "#,##0";
  });

  // --- Summary ---
  section(summary, "A1", "PersonaVal Summary");
  label(summary.getCell("A3"), "Ticker");
  input(summary.getCell("B3"), financials.quote.ticker);
  label(summary.getCell("A4"), "Company");
  input(summary.getCell("B4"), financials.quote.name);
  label(summary.getCell("A5"), "Price");
  input(summary.getCell("B5"), financials.quote.price);
  summary.getCell("B5").numFmt = "$#,##0.00";
  label(summary.getCell("A7"), "DCF price (Gordon)", true);
  link(summary.getCell("B7"), "'DCF Valuation'!B22", dcf.impliedPriceGordon, "$#,##0.00");
  label(summary.getCell("A8"), "DCF price (Exit)");
  link(summary.getCell("B8"), "'DCF Valuation'!B23", dcf.impliedPriceExit, "$#,##0.00");
  label(summary.getCell("A9"), "LBO MoIC");
  link(summary.getCell("B9"), "'LBO Model'!B16", lbo.base.moic, "0.00x");
  label(summary.getCell("A10"), "LBO IRR");
  link(summary.getCell("B10"), "'LBO Model'!B21", lbo.base.irr, "0.0%");
  label(summary.getCell("A12"), "YoY growth");
  input(summary.getCell("B12"), vc.yoyGrowth ?? 0);
  summary.getCell("B12").numFmt = "0.0%";
  label(summary.getCell("A13"), "Rule of 40");
  input(summary.getCell("B13"), vc.ruleOf40 ?? 0);
  summary.getCell("B13").numFmt = "0.0";
  label(summary.getCell("A14"), "FCF margin");
  input(summary.getCell("B14"), vc.fcfMargin ?? 0);
  summary.getCell("B14").numFmt = "0.0%";
  label(summary.getCell("A16"), "Latest revenue");
  link(
    summary.getCell("B16"),
    `'3-Statement Historical'!${col(years.length + 1)}4`,
    years.at(-1)?.revenue ?? 0,
    "#,##0",
  );
  summary.getColumn(1).width = 28;
  summary.getColumn(2).width = 22;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function col(n: number): string {
  return String.fromCharCode(64 + n);
}
