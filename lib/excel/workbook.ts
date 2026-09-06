import ExcelJS from "exceljs";
import type { EngineBundle } from "@/lib/engines/types";

const BLUE = "0000FF";
const BLACK = "000000";
const GREEN = "008000";
const HEADER = "111827";
const HEADER_FONT = "F9FAFB";
const INPUT_FILL = "EEF2FF";
const SECTION = "10B981";
const FONT = "Calibri";
const SIZE = 10;
const HEADER_SIZE = 11;

const FMT = {
  int: "#,##0",
  share: "#,##0.00",
  pct: "0.0%",
  multiple: '0.0"x"',
} as const;

function styleFont(
  cell: ExcelJS.Cell,
  color: string,
  opts?: { bold?: boolean; size?: number },
) {
  cell.font = {
    name: FONT,
    size: opts?.size ?? (opts?.bold ? HEADER_SIZE : SIZE),
    bold: Boolean(opts?.bold),
    color: { argb: color },
  };
}

function input(cell: ExcelJS.Cell, value: number | string, format?: string) {
  cell.value = value;
  styleFont(cell, BLUE);
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT_FILL } };
  cell.numFmt = format ?? (typeof value === "number" ? FMT.int : "@");
}

function formula(cell: ExcelJS.Cell, formulaText: string, result: number, format: string = FMT.int) {
  cell.value = { formula: formulaText, result };
  styleFont(cell, BLACK);
  cell.numFmt = format;
}

function link(cell: ExcelJS.Cell, formulaText: string, result: number | string, format: string = FMT.int) {
  cell.value = typeof result === "string" ? { formula: formulaText, result } : { formula: formulaText, result };
  styleFont(cell, GREEN);
  cell.numFmt = typeof result === "number" ? format : "@";
}

function label(cell: ExcelJS.Cell, text: string, bold = false) {
  cell.value = text;
  styleFont(cell, "111827", { bold });
}

function headerRow(sheet: ExcelJS.Worksheet, row: number, values: string[]) {
  values.forEach((v, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = v;
    styleFont(cell, HEADER_FONT, { bold: true, size: HEADER_SIZE });
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER } };
  });
}

function section(sheet: ExcelJS.Worksheet, cellAddr: string, text: string) {
  const cell = sheet.getCell(cellAddr);
  cell.value = text;
  styleFont(cell, SECTION, { bold: true, size: 14 });
}

function enableGrid(ws: ExcelJS.Worksheet) {
  ws.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
  ws.properties.defaultColWidth = 16;
  ws.properties.defaultRowHeight = 16;
}

export async function buildWorkbook(bundle: EngineBundle): Promise<Buffer> {
  const { financials, sliders, dcf, lbo, vc } = bundle;
  const wb = new ExcelJS.Workbook();
  wb.creator = "InvestMouse";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  const hist = wb.addWorksheet("3-Statement Historical");
  const dcfSheet = wb.addWorksheet("DCF Valuation");
  const lboSheet = wb.addWorksheet("LBO Model");
  for (const ws of [summary, hist, dcfSheet, lboSheet]) enableGrid(ws);

  const years = financials.years.filter((y) => y.year > 1990 && y.revenue > 0).slice(-5);
  const lastHistCol = col(years.length + 1);

  // --- Historicals (complete P&L years only; column B is the oldest of the last 5) ---
  section(hist, "A1", "3-Statement Historical");
  headerRow(hist, 3, ["Line item", ...years.map((y) => String(y.year))]);
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
        formula(hist.getCell(r, c + 2), `${col(c + 2)}6+${col(c + 2)}7`, getter(y), FMT.int);
      } else {
        input(hist.getCell(r, c + 2), getter(y), FMT.int);
      }
    });
  });
  hist.getColumn(1).width = 22;

  // --- DCF: blue drivers, black formulas, green cross-sheet links ---
  section(dcfSheet, "A1", "DCF Valuation");
  label(dcfSheet.getCell("A3"), "WACC", true);
  input(dcfSheet.getCell("B3"), sliders.wacc, FMT.pct);
  label(dcfSheet.getCell("A4"), "Terminal growth");
  input(dcfSheet.getCell("B4"), sliders.terminalGrowth, FMT.pct);
  label(dcfSheet.getCell("A5"), "Tax rate");
  input(dcfSheet.getCell("B5"), financials.defaults.taxRate, FMT.pct);
  label(dcfSheet.getCell("A6"), "Exit multiple");
  input(dcfSheet.getCell("B6"), sliders.exitMultiple, FMT.multiple);
  label(dcfSheet.getCell("A7"), "Net debt");
  input(dcfSheet.getCell("B7"), dcf.netDebt, FMT.int);
  label(dcfSheet.getCell("A8"), "Shares outstanding");
  input(dcfSheet.getCell("B8"), financials.quote.sharesOutstanding, FMT.int);

  label(dcfSheet.getCell("A10"), "Operating assumptions", true);
  label(dcfSheet.getCell("A11"), "Last historical revenue");
  link(
    dcfSheet.getCell("B11"),
    `'3-Statement Historical'!${lastHistCol}4`,
    dcf.lastHistoricalRevenue,
    FMT.int,
  );
  label(dcfSheet.getCell("A12"), "EBIT margin");
  input(dcfSheet.getCell("B12"), dcf.ebitMargin, FMT.pct);
  label(dcfSheet.getCell("A13"), "D&A % of sales");
  input(dcfSheet.getCell("B13"), dcf.daPct, FMT.pct);
  label(dcfSheet.getCell("A14"), "Capex % of sales");
  input(dcfSheet.getCell("B14"), dcf.capexPct, FMT.pct);
  label(dcfSheet.getCell("A15"), "NWC % of sales");
  input(dcfSheet.getCell("B15"), dcf.nwcPct, FMT.pct);

  headerRow(dcfSheet, 17, ["", "Y1", "Y2", "Y3", "Y4", "Y5"]);
  label(dcfSheet.getCell("A18"), "Revenue growth");
  dcf.growthRates.forEach((g, i) => input(dcfSheet.getCell(18, i + 2), g, FMT.pct));

  label(dcfSheet.getCell("A19"), "Projected revenue");
  formula(dcfSheet.getCell("B19"), "B11*(1+B18)", dcf.projectedRevenue[0] ?? 0, FMT.int);
  for (let i = 1; i < 5; i += 1) {
    const prev = col(i + 1);
    const cur = col(i + 2);
    formula(
      dcfSheet.getCell(19, i + 2),
      `${prev}19*(1+${cur}18)`,
      dcf.projectedRevenue[i] ?? 0,
      FMT.int,
    );
  }

  label(dcfSheet.getCell("A20"), "Projected EBIT");
  label(dcfSheet.getCell("A21"), "Projected D&A");
  label(dcfSheet.getCell("A22"), "Projected EBITDA");
  label(dcfSheet.getCell("A23"), "Projected Capex");
  label(dcfSheet.getCell("A24"), "Projected ΔNWC");
  label(dcfSheet.getCell("A25"), "Projected UFCF", true);

  const lastRev = dcf.lastHistoricalRevenue;
  for (let i = 0; i < 5; i += 1) {
    const c = col(i + 2);
    const rev = dcf.projectedRevenue[i] ?? 0;
    const prevRev = i === 0 ? lastRev : (dcf.projectedRevenue[i - 1] ?? lastRev);
    const ebit = rev * dcf.ebitMargin;
    const da = rev * dcf.daPct;
    const ebitda = ebit + da;
    const capex = rev * dcf.capexPct;
    const deltaNwc = (rev - prevRev) * dcf.nwcPct;
    const ufcf = ebit * (1 - financials.defaults.taxRate) + da - capex - deltaNwc;
    const prevRevRef = i === 0 ? "$B$11" : `${col(i + 1)}19`;
    formula(dcfSheet.getCell(20, i + 2), `${c}19*$B$12`, ebit, FMT.int);
    formula(dcfSheet.getCell(21, i + 2), `${c}19*$B$13`, da, FMT.int);
    formula(dcfSheet.getCell(22, i + 2), `${c}20+${c}21`, ebitda, FMT.int);
    formula(dcfSheet.getCell(23, i + 2), `${c}19*$B$14`, capex, FMT.int);
    formula(dcfSheet.getCell(24, i + 2), `(${c}19-${prevRevRef})*$B$15`, deltaNwc, FMT.int);
    formula(dcfSheet.getCell(25, i + 2), `${c}20*(1-$B$5)+${c}21-${c}23-${c}24`, ufcf, FMT.int);
  }

  label(dcfSheet.getCell("A27"), "TV (Gordon)", true);
  formula(dcfSheet.getCell("B27"), "IF(B3>B4,F25*(1+B4)/(B3-B4),F25*20)", dcf.terminalValueGordon, FMT.int);
  label(dcfSheet.getCell("A28"), "TV (Exit multiple)");
  formula(dcfSheet.getCell("B28"), "F22*B6", dcf.terminalValueExit, FMT.int);
  label(dcfSheet.getCell("A29"), "PV explicit CFs");
  formula(dcfSheet.getCell("B29"), "NPV(B3,B25:F25)", dcf.pvExplicitGordon, FMT.int);
  label(dcfSheet.getCell("A30"), "PV TV Gordon");
  formula(dcfSheet.getCell("B30"), "B27/(1+B3)^5", dcf.pvTerminalGordon, FMT.int);
  label(dcfSheet.getCell("A31"), "PV TV Exit");
  formula(dcfSheet.getCell("B31"), "B28/(1+B3)^5", dcf.pvTerminalExit, FMT.int);
  label(dcfSheet.getCell("A32"), "Enterprise value (Gordon)", true);
  formula(dcfSheet.getCell("B32"), "B29+B30", dcf.enterpriseValueGordon, FMT.int);
  label(dcfSheet.getCell("A33"), "Enterprise value (Exit)");
  formula(dcfSheet.getCell("B33"), "B29+B31", dcf.enterpriseValueExit, FMT.int);
  label(dcfSheet.getCell("A34"), "Equity value (Gordon)", true);
  formula(dcfSheet.getCell("B34"), "B32-B7", dcf.equityValueGordon, FMT.int);
  label(dcfSheet.getCell("A35"), "Equity value (Exit)", true);
  formula(dcfSheet.getCell("B35"), "B33-B7", dcf.equityValueExit, FMT.int);
  label(dcfSheet.getCell("A36"), "Implied price (Gordon)", true);
  formula(dcfSheet.getCell("B36"), "IF(B8=0,0,MAX(0,B34/B8))", dcf.impliedPriceGordon, FMT.share);
  label(dcfSheet.getCell("A37"), "Implied price (Exit)");
  formula(dcfSheet.getCell("B37"), "IF(B8=0,0,MAX(0,B35/B8))", dcf.impliedPriceExit, FMT.share);
  dcfSheet.getColumn(1).width = 28;

  // --- LBO ---
  section(lboSheet, "A1", "LBO Model");
  label(lboSheet.getCell("A3"), "Entry EV", true);
  link(lboSheet.getCell("B3"), "Summary!B7", lbo.entryEv, FMT.int);
  label(lboSheet.getCell("A4"), "Debt %");
  input(lboSheet.getCell("B4"), sliders.debtPct, FMT.pct);
  label(lboSheet.getCell("A5"), "Interest rate");
  input(lboSheet.getCell("B5"), lbo.interestRate, FMT.pct);
  label(lboSheet.getCell("A6"), "Annual paydown");
  input(lboSheet.getCell("B6"), lbo.paydownRate, FMT.pct);
  label(lboSheet.getCell("A7"), "Exit multiple");
  input(lboSheet.getCell("B7"), lbo.exitMultiple, FMT.multiple);
  label(lboSheet.getCell("A8"), "Entry EBITDA");
  input(lboSheet.getCell("B8"), lbo.entryEbitda, FMT.int);
  label(lboSheet.getCell("A9"), "Y5 EBITDA (base)");
  formula(lboSheet.getCell("B9"), "B29", lbo.base.years.at(-1)?.ebitda ?? 0, FMT.int);

  label(lboSheet.getCell("A11"), "Entry debt");
  formula(lboSheet.getCell("B11"), "B3*B4", lbo.entryDebt, FMT.int);
  label(lboSheet.getCell("A12"), "Entry equity");
  formula(lboSheet.getCell("B12"), "B3-B11", lbo.entryEquity, FMT.int);
  label(lboSheet.getCell("A13"), "Ending debt Y5");
  formula(lboSheet.getCell("B13"), "F29", lbo.base.endingDebt, FMT.int);
  label(lboSheet.getCell("A14"), "Exit EV");
  formula(lboSheet.getCell("B14"), "B9*B7", lbo.base.exitEv, FMT.int);
  label(lboSheet.getCell("A15"), "Exit equity", true);
  formula(lboSheet.getCell("B15"), "MAX(0,B14-B13)", lbo.base.exitEquity, FMT.int);
  label(lboSheet.getCell("A16"), "MoIC");
  formula(lboSheet.getCell("B16"), "IF(B12=0,0,B15/B12)", lbo.base.moic, FMT.multiple);

  label(lboSheet.getCell("A18"), "Equity cash flows", true);
  headerRow(lboSheet, 19, ["", "Y0", "Y1", "Y2", "Y3", "Y4", "Y5"]);
  label(lboSheet.getCell("A20"), "CF");
  formula(lboSheet.getCell("B20"), "-B12", -lbo.entryEquity, FMT.int);
  for (const colIdx of [3, 4, 5, 6]) {
    input(lboSheet.getCell(20, colIdx), 0, FMT.int);
  }
  formula(lboSheet.getCell("G20"), "B15", lbo.base.exitEquity, FMT.int);
  label(lboSheet.getCell("A21"), "IRR (5-year)", true);
  formula(lboSheet.getCell("B21"), "IRR(B20:G20)", lbo.base.irr, FMT.pct);
  label(lboSheet.getCell("A22"), "IRR check (MoIC^(1/5)-1)");
  formula(lboSheet.getCell("B22"), "IF(B16<=0,0,B16^(1/5)-1)", lbo.base.irr, FMT.pct);

  headerRow(lboSheet, 24, [
    "Year",
    "EBITDA",
    "Opening debt",
    "Interest",
    "Principal",
    "Ending debt",
    "Debt service",
    "Interest coverage",
  ]);
  lbo.base.years.forEach((yr, i) => {
    const r = 25 + i;
    input(lboSheet.getCell(r, 1), yr.year, "0");
    input(lboSheet.getCell(r, 2), yr.ebitda, FMT.int);
    if (i === 0) {
      formula(lboSheet.getCell(r, 3), "$B$11", yr.openingDebt, FMT.int);
    } else {
      formula(lboSheet.getCell(r, 3), `F${r - 1}`, yr.openingDebt, FMT.int);
    }
    formula(lboSheet.getCell(r, 4), `C${r}*$B$5`, yr.interest, FMT.int);
    formula(lboSheet.getCell(r, 5), `C${r}*$B$6`, yr.principal, FMT.int);
    formula(lboSheet.getCell(r, 6), `MAX(0,C${r}-E${r})`, yr.endingDebt, FMT.int);
    formula(lboSheet.getCell(r, 7), `D${r}+E${r}`, yr.interest + yr.principal, FMT.int);
    formula(
      lboSheet.getCell(r, 8),
      `IF(D${r}=0,0,B${r}/D${r})`,
      yr.interest > 0 ? yr.ebitda / yr.interest : 0,
      FMT.multiple,
    );
  });
  lboSheet.getColumn(1).width = 22;
  lboSheet.getColumn(7).width = 16;
  lboSheet.getColumn(8).width = 18;

  // --- Summary ---
  section(summary, "A1", "InvestMouse Summary");
  label(summary.getCell("A3"), "Ticker");
  input(summary.getCell("B3"), financials.quote.ticker);
  label(summary.getCell("A4"), "Company");
  input(summary.getCell("B4"), financials.quote.name);
  label(summary.getCell("A5"), "Current price");
  input(summary.getCell("B5"), financials.quote.price, FMT.share);
  label(summary.getCell("A6"), "Market cap");
  input(summary.getCell("B6"), financials.quote.marketCap, FMT.int);
  label(summary.getCell("A7"), "Enterprise value");
  input(summary.getCell("B7"), financials.quote.enterpriseValue, FMT.int);
  label(summary.getCell("A9"), "DCF price (Gordon)", true);
  link(summary.getCell("B9"), "'DCF Valuation'!B36", dcf.impliedPriceGordon, FMT.share);
  label(summary.getCell("A10"), "DCF price (Exit)");
  link(summary.getCell("B10"), "'DCF Valuation'!B37", dcf.impliedPriceExit, FMT.share);
  label(summary.getCell("A11"), "LBO MoIC");
  link(summary.getCell("B11"), "'LBO Model'!B16", lbo.base.moic, FMT.multiple);
  label(summary.getCell("A12"), "LBO IRR");
  link(summary.getCell("B12"), "'LBO Model'!B21", lbo.base.irr, FMT.pct);
  label(summary.getCell("A14"), "YoY growth");
  input(summary.getCell("B14"), vc.yoyGrowth ?? 0, FMT.pct);
  label(summary.getCell("A15"), "Rule of 40");
  input(summary.getCell("B15"), vc.ruleOf40 ?? 0, "0.0");
  label(summary.getCell("A16"), "FCF margin");
  input(summary.getCell("B16"), vc.fcfMargin ?? 0, FMT.pct);
  label(summary.getCell("A18"), "Latest revenue");
  link(summary.getCell("B18"), `'3-Statement Historical'!${lastHistCol}4`, years.at(-1)?.revenue ?? 0, FMT.int);
  label(
    summary.getCell("A20"),
    "InvestMouse is an AI research demo and does not provide SFC-licensed investment advice. Models use automated calculations & public data.",
  );
  summary.mergeCells("A20:B20");
  summary.getRow(20).height = 28;
  summary.getColumn(1).width = 28;
  summary.getColumn(2).width = 22;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function col(n: number): string {
  return String.fromCharCode(64 + n);
}
