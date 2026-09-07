"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/provider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { SmartMoneyInsight } from "@/lib/llm/schemas";
import { formatCompact } from "@/lib/format";
import {
  latestNamedFlow,
  pctDelta,
  sortChronological,
  type OwnershipParty,
  type OwnershipSignal,
  type OwnershipSnapshot,
} from "@/lib/data/ownership";

interface Payload {
  ticker: string;
  market: "HK" | "US";
  snapshots: OwnershipSnapshot[];
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function signedPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function signalCopy(
  signal: OwnershipSignal,
  market: "HK" | "US",
  t: (key: MessageKey) => string,
): { label: string; tone: string } {
  if (market === "HK") {
    if (signal === "INSTITUTIONAL_ACCUMULATION") return { label: t("ownershipSignalAcc"), tone: "border-bull/50 bg-bull/10 text-bull" };
    if (signal === "RETAIL_TRAP") return { label: t("ownershipSignalTrap"), tone: "border-bear/50 bg-bear/10 text-bear" };
    return { label: t("ownershipSignalNeutral"), tone: "border-border bg-muted/40 text-muted-foreground" };
  }
  if (signal === "INSIDER_BULLISH" || signal === "INSTITUTIONAL_ACCUMULATION") {
    return { label: t("ownershipSignalInsiderBull"), tone: "border-bull/50 bg-bull/10 text-bull" };
  }
  if (signal === "INSIDER_SELLING") {
    return { label: t("ownershipSignalInsiderSell"), tone: "border-bear/50 bg-bear/10 text-bear" };
  }
  return { label: t("ownershipSignalNeutral"), tone: "border-border bg-muted/40 text-muted-foreground" };
}

function PartyTable({ title, rows, empty }: { title: string; rows: OwnershipParty[]; empty: string }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm text-pretty">{empty}</p>
        ) : (
          <table className="font-financial w-full min-w-[16rem] text-sm">
            <tbody>
              {rows.slice(0, 5).map((row) => (
                <tr key={`${row.name}-${row.change_30d}`} className="border-border/60 border-b last:border-0">
                  <td className="py-2 pr-3 break-words">{row.name}</td>
                  <td className="py-2 text-right whitespace-nowrap">{row.change_30d || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function SmartMoneyBanner({
  insight,
  pending,
}: {
  insight: SmartMoneyInsight | null;
  pending: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="border-tech/40 from-tech/15 via-background to-bull/10 relative overflow-hidden rounded-xl border bg-linear-to-br px-4 py-4 shadow-[0_0_24px_rgba(59,130,246,0.18)]">
      <div className="flex items-start gap-3">
        <div className="bg-tech/20 text-tech mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full shadow-[0_0_16px_rgba(59,130,246,0.55)]">
          <Sparkles className={`size-4 ${pending ? "animate-pulse" : ""}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-tech text-[11px] tracking-[0.18em] uppercase">{t("smartMoneyTitle")}</div>
          {insight ? (
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
              {insight.bullets.map((bullet) => (
                <li key={bullet} className="text-pretty">
                  {bullet}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-2 text-sm">{pending ? t("smartMoneyGenerating") : t("smartMoneyWait")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function OwnershipFlowDashboard({
  ticker,
  insight = null,
  insightPending = false,
}: {
  ticker: string;
  insight?: SmartMoneyInsight | null;
  insightPending?: boolean;
}) {
  const { t, locale } = useI18n();
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ownership?ticker=${encodeURIComponent(ticker)}`)
      .then((res) => res.json())
      .then((json: Payload) => {
        if (!cancelled) setPayload({ ...json, ticker: json.ticker || ticker });
      })
      .catch(() => {
        if (!cancelled) setPayload({ ticker, market: ticker.endsWith(".HK") ? "HK" : "US", snapshots: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const snapshots = useMemo(() => sortChronological(payload?.snapshots ?? []), [payload]);
  const latest = snapshots.at(-1) ?? null;
  const market = payload?.market ?? (ticker.endsWith(".HK") ? "HK" : "US");
  const loading = !payload || payload.ticker !== ticker;

  if (loading) {
    return (
      <div className="space-y-4">
        <SmartMoneyBanner insight={insight} pending={insightPending} />
        <p className="text-muted-foreground py-6 text-sm">{t("ownershipLoading")}</p>
      </div>
    );
  }
  if (!latest) {
    return (
      <div className="space-y-4">
        <SmartMoneyBanner insight={insight} pending={insightPending} />
        <p className="text-muted-foreground py-6 text-sm">{t("ownershipEmpty")}</p>
      </div>
    );
  }

  const badge = signalCopy(latest.signal_type, market, t);
  const ordered = sortChronological(snapshots);
  const instDelta = pctDelta(ordered[0]?.institutional_pct ?? null, latest.institutional_pct);
  const retailDelta = pctDelta(ordered[0]?.retail_pct ?? null, latest.retail_pct);
  const flow = latestNamedFlow(snapshots);

  const hkSummary =
    snapshots.length < 2
      ? locale === "zh"
        ? `最新機構託管 ${fmtPct(latest.institutional_pct)}，零售經紀 ${fmtPct(latest.retail_pct)}。`
        : `Latest institutional custodians ${fmtPct(latest.institutional_pct)}; retail brokers ${fmtPct(latest.retail_pct)}.`
      : locale === "zh"
        ? `過去 ${snapshots.length} 個觀察日，機構託管持股變化 ${signedPct(instDelta)}，零售經紀變化 ${signedPct(retailDelta)}。`
        : `Over ${snapshots.length} snapshots, institutional custodians shifted ${signedPct(instDelta)} while retail brokers shifted ${signedPct(retailDelta)}.`;

  return (
    <div className="space-y-4">
      <SmartMoneyBanner insight={insight} pending={insightPending} />
      <div className={`rounded-lg border px-4 py-3 text-sm ${badge.tone}`}>
        <div className="font-medium">{badge.label}</div>
        <p className="mt-1 text-pretty opacity-90">{market === "HK" ? hkSummary : t("ownershipUsHint")}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {t("ownershipAsOf")} {latest.as_of_date}
        </p>
      </div>

      {market === "HK" ? (
        <>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm">{t("ownershipHkChart")}</CardTitle>
            </CardHeader>
            <CardContent className="h-52 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snapshots}>
                  <CartesianGrid stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="as_of_date" stroke="#9ca3af" fontSize={11} />
                  <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: "#111827", border: "1px solid #1f2937" }}
                    formatter={(v, name) => [`${Number(v ?? 0).toFixed(1)}%`, String(name)]}
                  />
                  <Line type="monotone" dataKey="institutional_pct" name={t("ownershipInst")} stroke="#10B981" dot={false} />
                  <Line type="monotone" dataKey="retail_pct" name={t("ownershipRetail")} stroke="#EF4444" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <PartyTable title={t("ownershipBuyers")} rows={flow.buyers} empty={t("ownershipBrokersEmpty")} />
            <PartyTable title={t("ownershipSellers")} rows={flow.sellers} empty={t("ownershipBrokersEmpty")} />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric label={t("ownershipInstHold")} value={fmtPct(latest.inst_holding_pct)} />
            <Metric label={t("ownershipInsider")} value={fmtPct(latest.insider_holding_pct)} />
            <Metric
              label={t("ownershipNetInsider")}
              value={latest.net_insider_usd == null ? "—" : formatCompact(latest.net_insider_usd, 1, "USD", true)}
            />
            <Metric label={t("ownershipShort")} value={fmtPct(latest.short_interest_pct)} />
          </div>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm">{t("ownershipUsChart")}</CardTitle>
            </CardHeader>
            <CardContent className="h-52 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={snapshots}>
                  <CartesianGrid stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="as_of_date" stroke="#9ca3af" fontSize={11} />
                  <YAxis yAxisId="pct" stroke="#9ca3af" fontSize={11} tickFormatter={(v) => `${v}%`} />
                  <YAxis yAxisId="usd" orientation="right" stroke="#9ca3af" fontSize={11} tickFormatter={(v) => formatCompact(Number(v), 1, "USD", true)} />
                  <Tooltip
                    contentStyle={{ background: "#111827", border: "1px solid #1f2937" }}
                  />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="inst_holding_pct"
                    name={t("ownershipInstHold")}
                    stroke="#10B981"
                    dot={false}
                  />
                  <Bar yAxisId="usd" dataKey="net_insider_usd" name={t("ownershipNetInsider")} fill="#F59E0B" />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-background/40 rounded-lg border p-3">
      <div className="text-muted-foreground text-[10px] tracking-[0.14em] uppercase">{label}</div>
      <div className="font-financial text-lg">{value}</div>
    </div>
  );
}
