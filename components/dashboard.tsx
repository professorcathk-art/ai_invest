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
import { runEngines } from "@/lib/engines";
import { fallbackAnalysis } from "@/lib/llm/personas";
import type { CompanyFinancials, PersonaScorecard, SliderAssumptions } from "@/lib/engines/types";
import type { IcAnalysis } from "@/lib/llm/schemas";

interface Payload {
  financials: CompanyFinancials;
  sliders: SliderAssumptions;
  personas: PersonaScorecard[];
}

export function Dashboard() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [sliders, setSliders] = useState<SliderAssumptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<IcAnalysis | null>(null);

  const bundle = useMemo(() => {
    if (!payload || !sliders) return null;
    return runEngines(payload.financials, sliders);
  }, [payload, sliders]);

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
    const local = fallbackAnalysis(bundle);
    setAnalysis(local);
    setAnalyzing(true);
    const controller = new AbortController();
    const abortTimer = window.setTimeout(() => controller.abort(), 55_000);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financials: payload.financials, sliders }),
        signal: controller.signal,
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("application/json")) {
        toast.warning("LLM timed out — showing quantitative IC script from the engines.");
        return;
      }
      const json = (await res.json()) as {
        analysis?: IcAnalysis;
        provider?: string;
        error?: string;
      };
      if (json.analysis) setAnalysis(json.analysis);
      if (json.provider === "fallback") {
        toast.message(json.error ?? "Showing quantitative IC script from the engines.");
      }
    } catch {
      toast.warning("IC request failed — showing quantitative IC script from the engines.");
    } finally {
      window.clearTimeout(abortTimer);
      setAnalyzing(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 py-6 md:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-bull text-[11px] tracking-[0.22em] uppercase">PersonaVal</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Multi-Persona VC/PE Valuation Engine
          </h1>
          <p className="text-muted-foreground text-sm">
            Deterministic DCF · LBO · VC engines. LLM interprets, never calculates.
          </p>
        </div>
        <TickerSearch onSelect={loadTicker} disabled={loading} />
      </header>

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Fetching statements and running engines…
        </div>
      ) : null}

      {!bundle ? (
        <div className="border-border bg-card flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
          <p className="text-lg font-medium">Load a ticker to open the workbench</p>
          <p className="text-muted-foreground mt-2 max-w-md text-sm">
            Demo fixtures ship for AAPL, NVDA, and 0700.HK. Add FMP_API_KEY for live coverage.
          </p>
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
          <ParamSliders value={bundle.sliders} onChange={setSliders} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button onClick={runIc} disabled={analyzing}>
              {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Run IC analysis
            </Button>
            <ExcelExportButton financials={bundle.financials} sliders={bundle.sliders} />
          </div>
          <Tabs defaultValue="personas">
            <TabsList>
              <TabsTrigger value="personas">Persona Matrix</TabsTrigger>
              <TabsTrigger value="workbench">Valuation Workbench</TabsTrigger>
              <TabsTrigger value="debate">IC Debate Room</TabsTrigger>
            </TabsList>
            <TabsContent value="personas">
              <PersonaMatrix scorecards={bundle.personas} analysis={analysis} />
            </TabsContent>
            <TabsContent value="workbench">
              <ValuationWorkbench dcf={bundle.dcf} lbo={bundle.lbo} vc={bundle.vc} />
            </TabsContent>
            <TabsContent value="debate">
              <IcDebate scorecards={bundle.personas} analysis={analysis} streaming={analyzing} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
