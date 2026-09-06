"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DcfResult, LboResult, VcResult } from "@/lib/engines/types";
import { formatCompact, formatMultiple, formatPct, formatPrice } from "@/lib/format";
import { useI18n } from "@/components/i18n/provider";

function heatColor(value: number, market: number): string {
  if (!market) return "bg-muted";
  const upside = value / market - 1;
  if (upside > 0.2) return "bg-bull/80 text-black";
  if (upside > 0) return "bg-bull/40";
  if (upside > -0.15) return "bg-caution/40";
  return "bg-bear/60";
}

function Sensitivity({
  title,
  rows,
  cols,
  matrix,
  market,
  colFormat,
  currency,
}: {
  title: string;
  rows: number[];
  cols: number[];
  matrix: number[][];
  market: number;
  colFormat: (v: number) => string;
  currency: string;
}) {
  return (
    <Card className="bg-card border-border overflow-x-auto">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="font-financial w-full text-xs">
          <thead>
            <tr>
              <th className="text-muted-foreground px-2 py-1 text-left">WACC \\ </th>
              {cols.map((c) => (
                <th key={c} className="px-2 py-1 text-right">
                  {colFormat(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((w, i) => (
              <tr key={w}>
                <td className="text-muted-foreground px-2 py-1">{formatPct(w)}</td>
                {matrix[i]?.map((price, j) => (
                  <td key={`${i}-${j}`} className="px-1 py-1">
                    <div className={`rounded px-2 py-1 text-right ${heatColor(price, market)}`}>
                      {formatPrice(price, currency)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function ValuationWorkbench({
  dcf,
  lbo,
  vc,
  currency = "USD",
}: {
  dcf: DcfResult;
  lbo: LboResult;
  vc: VcResult;
  currency?: string;
}) {
  const { t } = useI18n();
  const waterfall = [
    { name: "Entry equity", value: lbo.entryEquity / 1e6 },
    { name: "Exit equity", value: lbo.base.exitEquity / 1e6 },
    { name: "Bull exit", value: lbo.bull.exitEquity / 1e6 },
    { name: "Bear exit", value: lbo.bear.exitEquity / 1e6 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          label="DCF price (Gordon)"
          value={formatPrice(dcf.impliedPriceGordon, currency)}
          hint={dcf.impliedPriceGordon > 0 ? formatPct(dcf.upsideGordon) : "—"}
        />
        <Metric
          label="DCF price (Exit)"
          value={formatPrice(dcf.impliedPriceExit, currency)}
          hint={dcf.impliedPriceExit > 0 ? formatPct(dcf.upsideExit) : "—"}
        />
        <Metric label="Base LBO IRR / MoIC" value={formatPct(lbo.base.irr)} hint={formatMultiple(lbo.base.moic)} />
      </div>
      {dcf.equityValueGordon < 0 || dcf.impliedPriceGordon === 0 ? (
        <p className="text-muted-foreground text-pretty text-sm">{t("dcfNegativeNote")}</p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Sensitivity
          title="DCF sensitivity — WACC vs terminal growth"
          rows={dcf.waccAxis}
          cols={dcf.growthAxis}
          matrix={dcf.sensitivityWaccGrowth}
          market={dcf.marketPrice}
          colFormat={formatPct}
          currency={currency}
        />
        <Sensitivity
          title="DCF sensitivity — WACC vs exit multiple"
          rows={dcf.waccAxis}
          cols={dcf.exitAxis}
          matrix={dcf.sensitivityWaccExit}
          market={dcf.marketPrice}
          colFormat={formatMultiple}
          currency={currency}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm">LBO equity waterfall ($m)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfall}>
                <CartesianGrid stroke="#1f2937" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #1f2937" }}
                  formatter={(v) => [`$${Number(v ?? 0).toFixed(1)}m`, "Equity"]}
                />
                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm">VC / growth unit economics</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Metric label="YoY growth" value={formatPct(vc.yoyGrowth)} />
            <Metric label="3-yr CAGR" value={formatPct(vc.cagr3y)} />
            <Metric label="FCF margin" value={formatPct(vc.fcfMargin)} />
            <Metric label="Rule of 40" value={vc.ruleOf40 == null ? "—" : vc.ruleOf40.toFixed(1)} />
            <Metric label="EBITDA margin" value={formatPct(vc.ebitdaMargin)} />
            <Metric label="Gross margin" value={formatPct(vc.grossMargin)} />
            <Metric label="FCF conversion" value={formatPct(vc.fcfConversion)} />
            <Metric label="EV / Revenue" value={formatMultiple(vc.evRevenue)} />
            <Metric label="Net debt / EBITDA" value={formatMultiple(vc.netDebtToEbitda)} />
            <Metric label="ROIC" value={formatPct(vc.roic)} />
          </CardContent>
        </Card>
      </div>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm">LBO scenarios</CardTitle>
        </CardHeader>
        <CardContent className="font-financial grid gap-3 text-sm md:grid-cols-3">
          {[lbo.base, lbo.bull, lbo.bear].map((s) => (
            <div key={s.name} className="border-border rounded-lg border p-3">
              <div className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">{s.label}</div>
              <div>IRR {formatPct(s.irr)}</div>
              <div>MoIC {formatMultiple(s.moic)}</div>
              <div>Exit equity {formatCompact(s.exitEquity, 1, currency)}</div>
              <div>Ending debt {formatCompact(s.endingDebt, 1, currency)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-border bg-background/40 rounded-lg border p-3">
      <div className="text-muted-foreground text-[10px] tracking-[0.14em] uppercase">{label}</div>
      <div className="font-financial text-lg">{value}</div>
      {hint ? <div className="text-muted-foreground font-financial text-xs">{hint}</div> : null}
    </div>
  );
}
