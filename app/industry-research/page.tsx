"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/provider";
import {
  INDUSTRY_SECTORS,
  hktCalendarDate,
  isIndustrySectorId,
  isIsoDate,
  publishedDateHkt,
  shiftIsoDate,
  type IndustrySectorId,
  type SectorNameCall,
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

function NameList({ rows, empty, tone }: { rows: SectorNameCall[]; empty: string; tone: "bull" | "bear" }) {
  if (!rows.length) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.ticker}>
          <Badge variant="outline" className={tone === "bull" ? "text-bull font-financial" : "text-bear font-financial"}>
            {row.ticker}
          </Badge>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed text-pretty">{row.reason}</p>
        </li>
      ))}
    </ul>
  );
}

function IndustryResearchPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const today = useMemo(() => hktCalendarDate(), []);
  const yesterday = useMemo(() => shiftIsoDate(today, -1), [today]);
  const sectorParam = params.get("sector");
  const sector: IndustrySectorId = isIndustrySectorId(sectorParam) ? sectorParam : "ai";
  const date = isIsoDate(params.get("date")) ? params.get("date")! : today;
  const [data, setData] = useState<SectorResearch | null>(null);
  const [dates, setDates] = useState<string[]>([]);

  function replaceQuery(next: { sector?: IndustrySectorId; date?: string }) {
    const query = new URLSearchParams(params.toString());
    query.set("sector", next.sector ?? sector);
    query.set("date", next.date ?? date);
    router.replace(`/industry-research?${query.toString()}`, { scroll: false });
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/industry-research?sector=${sector}&lang=${locale}&date=${date}&days=3`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json as SectorResearch);
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            sector,
            date,
            locale,
            headlines: [],
            beneficiaries: [],
            atRisk: [],
            brief: [],
            persisted: false,
            live: false,
            fromDate: shiftIsoDate(date, -2),
            windowDays: 3,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sector, locale, date]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/industry-research?sector=${sector}&lang=${locale}&dates=1`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && Array.isArray(json.dates)) setDates(json.dates);
      })
      .catch(() => {
        if (!cancelled) setDates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sector, locale]);

  const loading = !data || data.sector !== sector || data.date !== date || data.locale !== locale;
  const fromDate = data?.fromDate ?? shiftIsoDate(date, -2);
  const groupedNews = useMemo(() => {
    const groups = new Map<string, NonNullable<SectorResearch["headlines"]>>();
    for (const item of data?.headlines ?? []) {
      const day = publishedDateHkt(item.publishedAt) || date;
      const list = groups.get(day) ?? [];
      list.push(item);
      groups.set(day, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data?.headlines, date]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-3 py-6 sm:px-4 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("industryTitle")}</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-relaxed">{t("industrySubtitle")}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="text-muted-foreground flex flex-col gap-1 text-[11px] tracking-[0.14em] uppercase">
          {t("industryPickDate")}
          <input
            type="date"
            value={date}
            max={today}
            onChange={(event) => replaceQuery({ date: event.target.value })}
            className="border-border bg-card text-foreground h-10 rounded-md border px-3 font-mono text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => replaceQuery({ date: today })}
          className={`rounded-full border px-3 py-1.5 text-xs ${
            date === today ? "border-bull bg-bull/15 text-foreground" : "border-border text-muted-foreground"
          }`}
        >
          {t("industryLast3Days")}
        </button>
        <button
          type="button"
          onClick={() => replaceQuery({ date: yesterday })}
          className={`rounded-full border px-3 py-1.5 text-xs ${
            date === yesterday ? "border-bull bg-bull/15 text-foreground" : "border-border text-muted-foreground"
          }`}
        >
          {t("industryYesterday")}
        </button>
        {dates.slice(0, 5).map((item) =>
          item === yesterday || item === today ? null : (
            <button
              key={item}
              type="button"
              onClick={() => replaceQuery({ date: item })}
              className={`rounded-full border px-3 py-1.5 font-mono text-xs ${
                date === item ? "border-bull bg-bull/15 text-foreground" : "border-border text-muted-foreground"
              }`}
            >
              {item}
            </button>
          ),
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {INDUSTRY_SECTORS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => replaceQuery({ sector: item.id })}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("industryDesk")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.brief ?? []).length ? (
            <ul className="space-y-2 text-sm leading-relaxed">
              {data!.brief.map((item) => (
                <li key={item} className="text-pretty">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm text-pretty">
              {data?.live ? t("industryLiveTape") : t("industryDeskEmpty")}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("industryBeneficiaries")}</CardTitle>
          </CardHeader>
          <CardContent>
            <NameList rows={data?.beneficiaries ?? []} empty={t("industryNamesEmpty")} tone="bull" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("industryAtRisk")}</CardTitle>
          </CardHeader>
          <CardContent>
            <NameList rows={data?.atRisk ?? []} empty={t("industryNamesEmpty")} tone="bear" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {t("industryNews")} · {fromDate} → {date}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.headlines ?? []).length === 0 && !loading ? (
            <p className="text-muted-foreground text-sm">{t("industryEmpty")}</p>
          ) : null}
          {groupedNews.map(([day, rows]) => (
            <div key={day} className="space-y-3">
              <p className="text-muted-foreground font-mono text-[11px] tracking-[0.12em] uppercase">{day}</p>
              {rows.map((item) => (
            <article key={`${item.url}-${item.title}`} className="border-border/70 border-b pb-3 last:border-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {item.tickers.length ? (
                  item.tickers.map((ticker) => (
                    <span key={ticker} className="font-financial text-xs">
                      {ticker}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground text-[10px]">{t("industryNoTicker")}</span>
                )}
                <span className="text-muted-foreground text-[10px]">{item.publisher}</span>
              </div>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="text-sm leading-relaxed hover:underline">
                  {item.title}
                </a>
              ) : (
                <p className="text-sm leading-relaxed">{item.title}</p>
              )}
            </article>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function IndustryResearchRoute() {
  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground flex items-center gap-2 px-4 py-8 text-sm">
          <Loader2 className="size-4 animate-spin" />
        </div>
      }
    >
      <IndustryResearchPage />
    </Suspense>
  );
}
