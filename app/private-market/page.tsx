"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/provider";
import type { PrivateDeal } from "@/lib/data/private-market";

function SourcesCell({ deal }: { deal: PrivateDeal }) {
  const sources = deal.sources?.length
    ? deal.sources
    : deal.url
      ? [{ label: "Source", url: deal.url }]
      : [];
  if (!sources.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {sources.map((source) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="text-tech hover:underline"
        >
          {source.label}
        </a>
      ))}
    </span>
  );
}

function sizeBucket(dealSize: string): "small" | "mid" | "large" | "unknown" {
  const n = Number(dealSize.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "unknown";
  if (dealSize.includes("B") || n >= 1000) return "large";
  if (n >= 100) return "mid";
  return "small";
}

export default function PrivateMarketPage() {
  const { t } = useI18n();
  const [deals, setDeals] = useState<PrivateDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [sector, setSector] = useState("all");
  const [size, setSize] = useState("all");
  const [lead, setLead] = useState("");

  useEffect(() => {
    fetch("/api/private-market")
      .then((res) => res.json())
      .then((json) => setDeals(Array.isArray(json.deals) ? json.deals : []))
      .catch(() => setDeals([]))
      .finally(() => setLoading(false));
  }, []);

  const sectors = useMemo(
    () => ["all", ...[...new Set(deals.map((d) => d.sector).filter(Boolean))].sort()],
    [deals],
  );

  const filtered = deals.filter((deal) => {
    if (sector !== "all" && deal.sector !== sector) return false;
    if (size !== "all" && sizeBucket(deal.dealSize) !== size) return false;
    if (lead && !`${deal.leadInvestors} ${deal.acquirer}`.toLowerCase().includes(lead.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-3 py-6 sm:px-4 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("privateTitle")}</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-relaxed">{t("privateSubtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          <span className="text-muted-foreground mb-1 block">{t("privateSector")}</span>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="border-border bg-background w-full rounded-md border px-2 py-2 text-sm"
          >
            {sectors.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? t("privateAllSectors") : item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground mb-1 block">{t("privateSize")}</span>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="border-border bg-background w-full rounded-md border px-2 py-2 text-sm"
          >
            <option value="all">{t("privateAllSizes")}</option>
            <option value="small">&lt; $100M</option>
            <option value="mid">$100M–$1B</option>
            <option value="large">$1B+</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground mb-1 block">{t("privateLead")}</span>
          <input
            value={lead}
            onChange={(e) => setLead(e.target.value)}
            placeholder="Sequoia, a16z, KKR"
            className="border-border bg-background w-full rounded-md border px-2 py-2 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> {t("fetching")}
        </div>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="space-y-2 px-6 py-10 text-center">
            <p className="font-medium">{t("privateEmpty")}</p>
            <p className="text-muted-foreground text-sm">{t("privateEmptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">{t("privateDate")}</th>
                <th className="px-3 py-2 font-medium">{t("privateTarget")}</th>
                <th className="px-3 py-2 font-medium">{t("privateBuyer")}</th>
                <th className="px-3 py-2 font-medium">{t("privateType")}</th>
                <th className="px-3 py-2 font-medium">{t("privateSector")}</th>
                <th className="px-3 py-2 font-medium">{t("privateSize")}</th>
                <th className="px-3 py-2 font-medium">{t("privateLead")}</th>
                <th className="px-3 py-2 font-medium">{t("privateSources")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((deal) => (
                <tr key={deal.id} className="border-border/60 border-t">
                  <td className="font-financial px-3 py-2 whitespace-nowrap">
                    {deal.announcedOn ? deal.announcedOn.slice(0, 10) : "—"}
                  </td>
                  <td className="px-3 py-2">{deal.target || "—"}</td>
                  <td className="px-3 py-2">{deal.acquirer || "—"}</td>
                  <td className="px-3 py-2">{deal.dealType || "—"}</td>
                  <td className="px-3 py-2">{deal.sector || "—"}</td>
                  <td className="font-financial px-3 py-2">{deal.dealSize || "—"}</td>
                  <td className="px-3 py-2">{deal.leadInvestors || "—"}</td>
                  <td className="px-3 py-2">
                    <SourcesCell deal={deal} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
