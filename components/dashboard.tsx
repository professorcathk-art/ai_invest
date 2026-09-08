"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TickerSearch } from "@/components/header/ticker-search";
import { QuoteBar } from "@/components/header/quote-bar";
import { ParamSliders } from "@/components/controls/param-sliders";
import { PersonaMatrix } from "@/components/persona/persona-matrix";
import { ValuationWorkbench } from "@/components/workbench/valuation-workbench";
import { OwnershipFlowDashboard } from "@/components/ownership/ownership-flow-dashboard";
import { DividendsCatalystsDashboard } from "@/components/dividends/dividends-catalysts-dashboard";
import { IcDebate } from "@/components/debate/ic-debate";
import { ExcelExportButton } from "@/components/excel-export-button";
import { CompanyContextPanel, ReferencesPanel } from "@/components/news/company-context";
import { LandingHero } from "@/components/home/landing-hero";
import { ComplianceModal, DisclaimerFooter } from "@/components/compliance-modal";
import { BusinessBreakdownDashboard } from "@/components/business/business-breakdown-dashboard";
import { useI18n } from "@/components/i18n/provider";
import { runEngines } from "@/lib/engines";
import { isUsableValuation } from "@/lib/data/normalize";
import type { CompanyFinancials, PersonaScorecard, SliderAssumptions } from "@/lib/engines/types";
import type { IcAnalysis } from "@/lib/llm/schemas";
import type { CompanyContext } from "@/lib/data/context";
import type { AnalysisDepth } from "@/lib/i18n/messages";
import type { BusinessBreakdown } from "@/lib/data/segments";
import {
  DEFAULT_PERSONA_IDS,
  MIN_SELECTED_PERSONAS,
  PERSONA_IDS,
  type PersonaId,
} from "@/lib/llm/persona-ids";
import { preferredOwnershipMarket, type OwnershipSnapshot } from "@/lib/data/ownership";
import { pushRecentTicker } from "@/lib/recent-tickers";
import { readLocalAnalysis, writeLocalAnalysis } from "@/lib/analysis-session";

interface Payload {
  financials: CompanyFinancials;
  sliders: SliderAssumptions;
  personas: PersonaScorecard[];
  booksReady: boolean;
  context: CompanyContext;
}

const PERSONA_LABEL: Record<PersonaId, "personaBuffett" | "personaThiel" | "personaPe" | "personaDalio" | "personaTrump" | "personaMusk"> = {
  buffett: "personaBuffett",
  thiel: "personaThiel",
  pe: "personaPe",
  dalio: "personaDalio",
  trump: "personaTrump",
  musk: "personaMusk",
};

export function Dashboard({ initialTicker }: { initialTicker?: string }) {
  const { t, locale } = useI18n();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [sliders, setSliders] = useState<SliderAssumptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<IcAnalysis | null>(null);
  const [modeOpen, setModeOpen] = useState(false);
  const [depthChoice, setDepthChoice] = useState<AnalysisDepth>("concise");
  const [selectedPersonas, setSelectedPersonas] = useState<PersonaId[]>([...DEFAULT_PERSONA_IDS]);
  const [synthesizeCatalysts, setSynthesizeCatalysts] = useState(false);
  const [business, setBusiness] = useState<BusinessBreakdown | null>(null);
  const [fromCache, setFromCache] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [ownershipTick, setOwnershipTick] = useState(0);
  const [ownershipSeed, setOwnershipSeed] = useState<{
    ticker: string;
    market: "HK" | "US";
    snapshots: OwnershipSnapshot[];
  } | null>(null);

  const bundle = useMemo(() => {
    if (!payload || !sliders) return null;
    return runEngines(payload.financials, sliders);
  }, [payload, sliders]);

  const valuationReady = Boolean(
    payload && bundle && isUsableValuation(payload.financials, bundle.dcf),
  );

  async function loadTicker(symbol: string) {
    setLoading(true);
    setSynthesizeCatalysts(false);
    setOwnershipSeed(null);
    const local = readLocalAnalysis(symbol, locale);
    if (local?.analysis?.narratives?.length) {
      setAnalysis(local.analysis);
      setFromCache(local.cachedAt);
    } else {
      setAnalysis(null);
      setFromCache(null);
    }
    try {
      const res = await fetch(`/api/ticker/${encodeURIComponent(symbol)}?lang=${locale}`);
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
      setBusiness(json.business ?? null);
      setRecent(pushRecentTicker(next.financials.quote.ticker));
      const server = json.cachedAnalysis as
        | { analysis?: IcAnalysis; cachedAt?: string; mode?: string }
        | null
        | undefined;
      if (server?.analysis?.narratives?.length) {
        const serverAt = server.cachedAt ?? new Date().toISOString();
        const localOlder = !local || new Date(serverAt).getTime() >= new Date(local.cachedAt).getTime();
        if (localOlder) {
          setAnalysis(server.analysis);
          setFromCache(serverAt);
          writeLocalAnalysis({
            ticker: next.financials.quote.ticker,
            locale,
            depth: server.mode === "professional" ? "professional" : "concise",
            personas: selectedPersonas,
            analysis: server.analysis,
            cachedAt: serverAt,
          });
        }
      }
      for (const warning of (json.financials.warnings as string[]) ?? []) {
        toast.warning(warning);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load ticker");
    } finally {
      setLoading(false);
    }
  }

  const ticker = payload?.financials.quote.ticker;
  useEffect(() => {
    if (!ticker) return;
    fetch(`/api/ticker/${encodeURIComponent(ticker)}?lang=${locale}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.context) {
          setPayload((prev) => (prev ? { ...prev, context: json.context } : prev));
        }
      })
      .catch(() => {
        // Locale refresh is optional.
      });
  }, [locale, ticker]);

  useEffect(() => {
    if (!initialTicker) return;
    const timer = window.setTimeout(() => {
      void loadTicker(initialTicker);
    }, 0);
    return () => window.clearTimeout(timer);
    // Deep-link from top-nav recent badges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicker]);

  async function runIc(depth: AnalysisDepth) {
    if (!payload || !sliders || !bundle) return;
    setModeOpen(false);
    setAnalysis(null);
    setFromCache(null);
    setAnalyzing(true);
    setOwnershipTick((n) => n + 1);
    setSynthesizeCatalysts(true);
    const controller = new AbortController();
    const abortTimer = window.setTimeout(() => controller.abort(), 58_000);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          financials: payload.financials,
          sliders,
          locale,
          depth,
          selected_personas: selectedPersonas,
        }),
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
            smartMoneyInsight?: IcAnalysis["smartMoneyInsight"];
            cachedAt?: string;
            fromCache?: boolean;
            business?: BusinessBreakdown;
            snapshots?: OwnershipSnapshot[];
            ownershipMarket?: "HK" | "US";
            error?: string;
          };
          if (event.type === "context" && event.context) {
            setPayload((prev) => (prev ? { ...prev, context: event.context! } : prev));
            if (event.business) setBusiness(event.business);
            if (event.snapshots) {
              const symbol = payload.financials.quote.ticker;
              setOwnershipSeed({
                ticker: symbol,
                snapshots: event.snapshots,
                market: event.ownershipMarket ?? preferredOwnershipMarket(event.snapshots, symbol),
              });
            }
          }
          if (event.type === "cached" && event.analysis) {
            setAnalysis(event.analysis);
            setFromCache(event.cachedAt ?? new Date().toISOString());
          }
          if (event.type === "smartMoney" && event.smartMoneyInsight) {
            const insight = event.smartMoneyInsight;
            setAnalysis((prev) => ({
              narratives: prev?.narratives ?? [],
              debate: prev?.debate ?? [],
              chairSummary: prev?.chairSummary ?? "",
              smartMoneyInsight: insight,
            }));
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
              smartMoneyInsight: prev?.smartMoneyInsight,
            }));
          }
          if (event.type === "complete" && event.analysis) {
            setAnalysis(event.analysis);
            const cachedAt = event.fromCache ? event.cachedAt ?? new Date().toISOString() : new Date().toISOString();
            if (event.fromCache) setFromCache(cachedAt);
            writeLocalAnalysis({
              ticker: payload.financials.quote.ticker,
              locale,
              depth,
              personas: selectedPersonas,
              analysis: event.analysis,
              cachedAt,
            });
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
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-3 py-4 pb-20 sm:gap-5 sm:px-4 sm:py-6 md:px-8">
      <ComplianceModal />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          {payload ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("titleShort")}</h1>
              <p className="text-muted-foreground max-w-2xl text-pretty text-sm">{t("subtitle")}</p>
            </>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          {payload ? (
            <TickerSearch
              onSelect={loadTicker}
              disabled={loading}
              placeholder={t("searchPlaceholder")}
            />
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> {t("fetching")}
        </div>
      ) : null}

      {!bundle || !payload ? (
        <LandingHero onSelect={loadTicker} disabled={loading} recent={recent.length ? recent : undefined} />
      ) : (
        <>
          <QuoteBar quote={bundle.financials.quote} />
          <CompanyContextPanel context={payload.context} />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setModeOpen(true)} disabled={analyzing} size="lg" className="w-full sm:w-auto">
              {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {analyzing ? t("generating") : t("runIc")}
            </Button>
            {fromCache ? (
              <span className="text-bull rounded-full border border-bull/30 bg-bull/10 px-2.5 py-1 text-xs">
                ⚡ {t("cacheLoaded")}
              </span>
            ) : null}
          </div>
          <Dialog
            open={modeOpen}
            onOpenChange={(open) => {
              setModeOpen(open);
              if (open) setDepthChoice("concise");
            }}
          >
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t("modeTitle")}</DialogTitle>
                <DialogDescription className="text-pretty">{t("pressRunHint")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["concise", "professional"] as const).map((mode) => {
                  const selected = depthChoice === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setDepthChoice(mode)}
                      className={`min-h-[7.5rem] h-auto rounded-xl border p-4 text-left whitespace-normal ${
                        selected
                          ? "border-bull bg-bull/15 ring-bull/40 ring-2"
                          : "border-border bg-background hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-medium">
                        {mode === "concise" ? t("modeConcise") : t("modeProfessional")}
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs leading-relaxed text-pretty">
                        {mode === "concise" ? t("modeConciseHint") : t("modeProfessionalHint")}
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">{t("personaSelectTitle")}</div>
                <p className="text-muted-foreground text-xs leading-relaxed">{t("personaSelectHint")}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PERSONA_IDS.map((id) => {
                    const checked = selectedPersonas.includes(id);
                    return (
                      <label
                        key={id}
                        className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          checked ? "border-bull bg-bull/10" : "border-border"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedPersonas((prev) =>
                              prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
                            );
                          }}
                        />
                        {t(PERSONA_LABEL[id])}
                      </label>
                    );
                  })}
                </div>
                {selectedPersonas.length < MIN_SELECTED_PERSONAS ? (
                  <p className="text-caution text-xs">{t("personaMinError")}</p>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setModeOpen(false)}>
                  {t("modeCancel")}
                </Button>
                <Button
                  onClick={() => runIc(depthChoice)}
                  disabled={selectedPersonas.length < MIN_SELECTED_PERSONAS}
                >
                  {t("modeConfirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Tabs defaultValue="personas" className="min-w-0">
            <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:overflow-visible sm:px-0">
              <TabsList className="bg-muted flex h-11 w-max min-w-full flex-nowrap items-center justify-start gap-1 rounded-xl p-1 group-data-horizontal/tabs:h-11 sm:w-fit sm:flex-wrap">
                <TabsTrigger
                  value="personas"
                  className="h-9 flex-none items-center px-3 text-xs leading-none whitespace-nowrap after:hidden sm:text-sm"
                >
                  {t("tabPersonas")}
                </TabsTrigger>
                <TabsTrigger
                  value="workbench"
                  className="h-9 flex-none items-center px-3 text-xs leading-none whitespace-nowrap after:hidden sm:text-sm"
                >
                  {t("tabWorkbench")}
                </TabsTrigger>
                <TabsTrigger
                  value="debate"
                  className="h-9 flex-none items-center px-3 text-xs leading-none whitespace-nowrap after:hidden sm:text-sm"
                >
                  {t("tabDebate")}
                </TabsTrigger>
                <TabsTrigger
                  value="ownership"
                  className="h-9 flex-none items-center px-3 text-xs leading-none whitespace-nowrap after:hidden sm:text-sm"
                >
                  {t("tabOwnership")}
                </TabsTrigger>
                <TabsTrigger
                  value="catalysts"
                  className="h-9 flex-none items-center px-3 text-xs leading-none whitespace-nowrap after:hidden sm:text-sm"
                >
                  {t("tabCatalysts")}
                </TabsTrigger>
                <TabsTrigger
                  value="business"
                  className="h-9 flex-none items-center px-3 text-xs leading-none whitespace-nowrap after:hidden sm:text-sm"
                >
                  {t("tabBusiness")}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="personas">
              <PersonaMatrix
                scorecards={bundle.personas.filter((p) => selectedPersonas.includes(p.id))}
                analysis={analysis}
                booksReady={valuationReady}
                analyzing={analyzing}
              />
            </TabsContent>
            <TabsContent value="workbench">
              {valuationReady && sliders ? (
                <div className="space-y-4">
                  <ParamSliders value={sliders} onChange={setSliders} />
                  <ExcelExportButton financials={bundle.financials} sliders={bundle.sliders} />
                  <ValuationWorkbench
                    dcf={bundle.dcf}
                    lbo={bundle.lbo}
                    vc={bundle.vc}
                    quote={bundle.financials.quote}
                    currency={bundle.financials.quote.currency}
                  />
                </div>
              ) : (
                <p className="text-muted-foreground py-10 text-sm">
                  {t("workbenchHidden")}
                </p>
              )}
            </TabsContent>
            <TabsContent value="debate">
              <IcDebate
                scorecards={bundle.personas.filter((p) => selectedPersonas.includes(p.id))}
                analysis={analysis}
                streaming={analyzing}
                booksReady={valuationReady}
              />
            </TabsContent>
            <TabsContent value="ownership">
              <OwnershipFlowDashboard
                ticker={bundle.financials.quote.ticker}
                insight={analysis?.smartMoneyInsight ?? null}
                insightPending={analyzing && !analysis?.smartMoneyInsight}
                refreshKey={ownershipTick}
                seeded={ownershipSeed}
              />
            </TabsContent>
            <TabsContent value="catalysts">
              <DividendsCatalystsDashboard
                ticker={bundle.financials.quote.ticker}
                synthesize={synthesizeCatalysts}
              />
            </TabsContent>
            <TabsContent value="business">
              <BusinessBreakdownDashboard breakdown={business} />
            </TabsContent>
          </Tabs>
          {analysis ? <ReferencesPanel context={payload.context} /> : null}
        </>
      )}
      <DisclaimerFooter />
    </div>
  );
}
