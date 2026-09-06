"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TickerSearch } from "@/components/header/ticker-search";
import { QuoteBar } from "@/components/header/quote-bar";
import { ParamSliders } from "@/components/controls/param-sliders";
import { PersonaMatrix } from "@/components/persona/persona-matrix";
import { ValuationWorkbench } from "@/components/workbench/valuation-workbench";
import { IcDebate } from "@/components/debate/ic-debate";
import { ExcelExportButton } from "@/components/excel-export-button";
import { CompanyContextPanel, ReferencesPanel } from "@/components/news/company-context";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useI18n } from "@/components/i18n/provider";
import { runEngines } from "@/lib/engines";
import { isUsableValuation } from "@/lib/data/normalize";
import type { CompanyFinancials, PersonaScorecard, SliderAssumptions } from "@/lib/engines/types";
import type { IcAnalysis } from "@/lib/llm/schemas";
import type { CompanyContext } from "@/lib/data/context";

interface Payload {
  financials: CompanyFinancials;
  sliders: SliderAssumptions;
  personas: PersonaScorecard[];
  booksReady: boolean;
  context: CompanyContext;
}

export function Dashboard() {
  const { t, locale } = useI18n();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [sliders, setSliders] = useState<SliderAssumptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<IcAnalysis | null>(null);

  const bundle = useMemo(() => {
    if (!payload || !sliders) return null;
    return runEngines(payload.financials, sliders);
  }, [payload, sliders]);

  const valuationReady = Boolean(
    payload && bundle && isUsableValuation(payload.financials, bundle.dcf),
  );

  async function loadTicker(symbol: string) {
    setLoading(true);
    setAnalysis(null);
    try {
      const res = await fetch(`/api/ticker/${encodeURIComponent(symbol)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ticker failed");
      const next: Payload = {
        financials: json.financials,
        sliders: json.sliders,
        personas: json.personas,
        booksReady: Boolean(json.booksReady),
        context: json.context ?? { businessSummary: "", news: [], highlights: [], references: [] },
      };
      setPayload(next);
      setSliders(json.sliders);
      for (const warning of (json.financials.warnings as string[]) ?? []) {
        toast.warning(warning);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load ticker");
    } finally {
      setLoading(false);
    }
  }

  async function runIc() {
    if (!payload || !sliders || !bundle) return;
    setAnalysis(null);
    setAnalyzing(true);
    const controller = new AbortController();
    const abortTimer = window.setTimeout(() => controller.abort(), 55_000);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financials: payload.financials, sliders, locale }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(json.error ?? "DeepSeek did not finish. Try again, or set DEEPSEEK_MODEL to deepseek-v4-flash.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      let failed = false;

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type?: string;
            context?: CompanyContext;
            narrative?: IcAnalysis["narratives"][number];
            analysis?: IcAnalysis;
            error?: string;
          };
          if (event.type === "context" && event.context) {
            setPayload((prev) => (prev ? { ...prev, context: event.context! } : prev));
          }
          if (event.type === "persona" && event.narrative) {
            const incoming = event.narrative;
            setAnalysis((prev) => ({
              narratives: [
                ...(prev?.narratives ?? []).filter((n) => n.id !== incoming.id),
                incoming,
              ],
              debate: prev?.debate ?? [],
              chairSummary: prev?.chairSummary ?? "",
            }));
          }
          if (event.type === "complete" && event.analysis) {
            setAnalysis(event.analysis);
            completed = true;
          }
          if (event.type === "error") {
            failed = true;
            toast.error(
              event.error ??
                "DeepSeek did not finish. Try again, or set DEEPSEEK_MODEL to deepseek-v4-flash.",
            );
          }
        }
        if (done) break;
      }

      if (!completed && !failed) {
        toast.error("DeepSeek did not finish. No mock memo was inserted.");
      }
    } catch {
      toast.error("IC request failed or was aborted. No mock memo was inserted.");
    } finally {
      window.clearTimeout(abortTimer);
      setAnalyzing(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 py-6 md:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-bull text-[11px] tracking-[0.22em] uppercase">{t("brand")}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <LanguageToggle />
          <TickerSearch onSelect={loadTicker} disabled={loading} />
        </div>
      </header>

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> {t("fetching")}
        </div>
      ) : null}

      {!bundle || !payload ? (
        <div className="border-border bg-card flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
          <p className="text-lg font-medium">{t("loadTicker")}</p>
          <p className="text-muted-foreground mt-2 max-w-md text-sm">{t("loadHint")}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {["AAPL", "NVDA", "0700.HK"].map((symbol) => (
              <Button key={symbol} variant="outline" onClick={() => loadTicker(symbol)}>
                {symbol}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <QuoteBar quote={bundle.financials.quote} />
          <CompanyContextPanel context={payload.context} />
          {valuationReady ? <ParamSliders value={bundle.sliders} onChange={setSliders} /> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button onClick={runIc} disabled={analyzing} size="lg">
              {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {analyzing ? t("generating") : t("runIc")}
            </Button>
            {valuationReady ? (
              <ExcelExportButton financials={bundle.financials} sliders={bundle.sliders} />
            ) : null}
          </div>
          <Tabs defaultValue="personas">
            <TabsList>
              <TabsTrigger value="personas">{t("tabPersonas")}</TabsTrigger>
              <TabsTrigger value="workbench">{t("tabWorkbench")}</TabsTrigger>
              <TabsTrigger value="debate">{t("tabDebate")}</TabsTrigger>
            </TabsList>
            <TabsContent value="personas">
              <PersonaMatrix
                scorecards={bundle.personas}
                analysis={analysis}
                booksReady={valuationReady}
                analyzing={analyzing}
              />
            </TabsContent>
            <TabsContent value="workbench">
              {valuationReady ? (
                <ValuationWorkbench dcf={bundle.dcf} lbo={bundle.lbo} vc={bundle.vc} />
              ) : (
                <p className="text-muted-foreground py-10 text-sm">
                  {t("workbenchHidden")}
                </p>
              )}
            </TabsContent>
            <TabsContent value="debate">
              <IcDebate
                scorecards={bundle.personas}
                analysis={analysis}
                streaming={analyzing}
                booksReady={valuationReady}
              />
            </TabsContent>
          </Tabs>
          {analysis ? <ReferencesPanel context={payload.context} /> : null}
        </>
      )}
    </div>
  );
}
