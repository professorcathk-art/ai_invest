"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/provider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  type CatalystEvent,
  type CatalystImpact,
  type CatalystType,
  type DividendCatalystPack,
} from "@/lib/data/catalysts";
import { formatPrice } from "@/lib/format";

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

const TYPE_COPY: Record<CatalystType, { icon: string; key: MessageKey }> = {
  earnings: { icon: "🎯", key: "catEarnings" },
  buyback: { icon: "💰", key: "catBuyback" },
  product: { icon: "🚀", key: "catProduct" },
  regulatory: { icon: "⚖️", key: "catRegulatory" },
  other: { icon: "📌", key: "catOther" },
};

const IMPACT_TONE: Record<CatalystImpact, { key: MessageKey; className: string }> = {
  bullish: { key: "impactBullish", className: "border-bull/40 bg-bull/10 text-bull" },
  bearish: { key: "impactBearish", className: "border-bear/40 bg-bear/10 text-bear" },
  volatility: { key: "impactVolatility", className: "border-caution/40 bg-caution/10 text-caution" },
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-background/40 rounded-lg border p-3">
      <div className="text-muted-foreground text-[10px] tracking-[0.14em] uppercase">{label}</div>
      <div className="font-financial mt-1 text-lg">{value}</div>
    </div>
  );
}

function Timeline({ events }: { events: CatalystEvent[] }) {
  const { t } = useI18n();
  return (
    <ol className="relative space-y-4 border-l border-tech/30 pl-5">
      {events.map((event) => {
        const type = TYPE_COPY[event.type];
        const impact = IMPACT_TONE[event.impact];
        return (
          <li key={`${event.date ?? "na"}-${event.title}`} className="relative">
            <span className="bg-tech absolute top-1.5 -left-[27px] size-2.5 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.7)]" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="border-border bg-muted/40 rounded-full border px-2 py-0.5 text-[11px]">
                {type.icon} {t(type.key)}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${impact.className}`}>{t(impact.key)}</span>
              <span className="text-muted-foreground font-financial text-xs">{event.date ?? "—"}</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-pretty">{event.title}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function DividendsCatalystsDashboard({
  ticker,
  synthesize,
}: {
  ticker: string;
  synthesize: boolean;
}) {
  const { t, locale } = useI18n();
  const [pack, setPack] = useState<DividendCatalystPack | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/catalysts?ticker=${encodeURIComponent(ticker)}&lang=${locale}&synthesize=${synthesize ? "1" : "0"}`)
      .then((res) => res.json())
      .then((json: DividendCatalystPack) => {
        if (!cancelled && json?.ticker) setPack(json);
      })
      .catch(() => {
        if (!cancelled) setPack(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, locale, synthesize]);

  const ready = pack?.ticker === ticker;
  if (!ready) {
    return <p className="text-muted-foreground py-10 text-sm">{t("catalystsLoading")}</p>;
  }

  const history = [...pack.history].sort((a, b) => a.period.localeCompare(b.period));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("divYield")} value={fmtPct(pack.dividend.yieldPct)} />
        <Metric label={t("divPayout")} value={fmtPct(pack.dividend.payoutRatioPct)} />
        <Metric label={t("divExDate")} value={pack.dividend.exDividendDate ?? "—"} />
        <Metric
          label={t("divDps")}
          value={
            pack.dividend.annualDps == null || pack.dividend.annualDps === 0
              ? "—"
              : formatPrice(pack.dividend.annualDps, pack.currency)
          }
        />
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm">{t("divTimeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          {pack.catalysts.length === 0 ? (
            <p className="text-muted-foreground text-sm">—</p>
          ) : (
            <Timeline events={pack.catalysts} />
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm">{t("divHistory")}</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">—</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history}>
                <CartesianGrid stroke="#1f2937" vertical={false} />
                <XAxis dataKey="period" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #1f2937" }}
                  formatter={(value) => [formatPrice(Number(value ?? 0), pack.currency), t("divDps")]}
                />
                <Bar dataKey="dps" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
