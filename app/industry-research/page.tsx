"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/provider";
import {
  INDUSTRY_SECTORS,
  type IndustrySectorId,
  type SectorResearch,
} from "@/lib/data/industry-sectors";
import type { MessageKey } from "@/lib/i18n/messages";

const SECTOR_LABEL: Record<IndustrySectorId, MessageKey> = {
  ai: "sectorAi",
  "china-internet": "sectorChina",
  ev: "sectorEv",
  biotech: "sectorBio",
  consumer: "sectorConsumer",
};

export default function IndustryResearchPage() {
  const { t, locale } = useI18n();
  const [sector, setSector] = useState<IndustrySectorId>("ai");
  const [data, setData] = useState<SectorResearch | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/industry-research?sector=${sector}&lang=${locale}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json as SectorResearch);
      })
      .catch(() => {
        if (!cancelled) setData({ sector, headlines: [], beneficiaries: [], atRisk: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [sector, locale]);

  const loading = data?.sector !== sector;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-3 py-6 sm:px-4 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("industryTitle")}</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-relaxed">{t("industrySubtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {INDUSTRY_SECTORS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSector(item.id)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              sector === item.id
                ? "border-bull bg-bull/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {t(SECTOR_LABEL[item.id])}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> {t("fetching")}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("industryBeneficiaries")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(data?.beneficiaries ?? []).length ? (
              data!.beneficiaries.map((ticker) => (
                <Badge key={ticker} variant="outline" className="text-bull font-financial">
                  {ticker}
                </Badge>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">{t("industryEmpty")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("industryAtRisk")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(data?.atRisk ?? []).length ? (
              data!.atRisk.map((ticker) => (
                <Badge key={ticker} variant="outline" className="text-bear font-financial">
                  {ticker}
                </Badge>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">{t("industryEmpty")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("industryNews")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.headlines ?? []).length === 0 && !loading ? (
            <p className="text-muted-foreground text-sm">{t("industryEmpty")}</p>
          ) : null}
          {data?.headlines.map((item) => (
            <article key={`${item.ticker}-${item.title}`} className="border-border/70 border-b pb-3 last:border-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-financial text-xs">{item.ticker}</span>
                <Badge variant="outline" className="text-[10px]">
                  {item.impact === "beneficiary"
                    ? t("impactBullish")
                    : item.impact === "at_risk"
                      ? t("impactBearish")
                      : t("industryWatch")}
                </Badge>
                <span className="text-muted-foreground text-[10px]">{item.publisher}</span>
              </div>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="text-sm leading-relaxed hover:underline">
                  {item.title}
                </a>
              ) : (
                <p className="text-sm leading-relaxed">{item.title}</p>
              )}
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{item.lens}</p>
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
