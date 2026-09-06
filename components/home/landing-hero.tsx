"use client";

import { Calculator, FileSpreadsheet, Search, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TickerSearch } from "@/components/header/ticker-search";
import { useI18n } from "@/components/i18n/provider";

const QUICK_TICKERS = ["NVDA", "0700.HK", "9988.HK", "AAPL", "TSLA"] as const;

const STEPS = [
  { n: "01", title: "step1Title", body: "step1Body", icon: Search },
  { n: "02", title: "step2Title", body: "step2Body", icon: Calculator },
  { n: "03", title: "step3Title", body: "step3Body", icon: Users },
] as const;

const FEATURES = [
  { title: "feature1Title", body: "feature1Body", icon: Calculator },
  { title: "feature2Title", body: "feature2Body", icon: Users },
  { title: "feature3Title", body: "feature3Body", icon: FileSpreadsheet },
] as const;

export function LandingHero({
  onSelect,
  disabled,
}: {
  onSelect: (symbol: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-linear-to-b from-card via-card to-background px-5 py-12 sm:px-10 sm:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-bull/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 h-48 w-48 rounded-full bg-tech/10 blur-3xl"
      />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <p className="text-bull mb-3 flex items-center gap-2 text-[11px] tracking-[0.28em] uppercase">
          <Sparkles className="size-3.5" />
          {t("brand")}
        </p>
        <h1 className="text-pretty text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-pretty text-sm leading-relaxed sm:text-base">
          {t("subtitle")}
        </p>

        <div className="mt-8 flex w-full justify-center">
          <TickerSearch
            variant="hero"
            onSelect={onSelect}
            disabled={disabled}
            placeholder={t("searchPlaceholder")}
          />
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {QUICK_TICKERS.map((symbol) => (
            <Button
              key={symbol}
              type="button"
              variant="outline"
              size="sm"
              className="font-financial rounded-full"
              disabled={disabled}
              onClick={() => onSelect(symbol)}
            >
              {symbol}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative mx-auto mt-14 max-w-5xl">
        <p className="text-muted-foreground mb-3 text-center text-[11px] tracking-[0.2em] uppercase">
          {t("stepsLabel")}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.n} className="bg-background/60 border-white/8">
                <CardHeader>
                  <p className="text-bull font-financial text-xs tracking-widest">{step.n}</p>
                  <CardTitle className="flex items-start gap-2 text-base">
                    <Icon className="text-bull mt-0.5 size-4 shrink-0" />
                    {t(step.title)}
                  </CardTitle>
                  <CardDescription className="text-pretty leading-relaxed">{t(step.body)}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="relative mx-auto mt-10 max-w-5xl">
        <p className="text-muted-foreground mb-3 text-center text-[11px] tracking-[0.2em] uppercase">
          {t("featuresLabel")}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="bg-background/60 border-white/8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="text-bull size-4 shrink-0" />
                    {t(feature.title)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-pretty leading-relaxed">{t(feature.body)}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
