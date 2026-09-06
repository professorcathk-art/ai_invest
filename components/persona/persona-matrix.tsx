"use client";

import { Check, Loader2, Minus, Sparkles, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IcAnalysis } from "@/lib/llm/schemas";
import type { PersonaScorecard } from "@/lib/engines/types";
import { formatMultiple, formatNumber, formatPct, voteLabel, voteTone } from "@/lib/format";
import { useI18n } from "@/components/i18n/provider";

function formatActual(check: PersonaScorecard["checks"][number]): string {
  const value = check.actual;
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (check.format === "years") return `${value} / 5 years`;
  if (check.format === "number") return formatNumber(value, 1);
  if (check.format === "multiple") return formatMultiple(value);
  if (check.format === "pct") return formatPct(value);
  return formatNumber(value, 1);
}

function Status({ passed }: { passed: boolean | null }) {
  if (passed == null) return <Minus className="text-muted-foreground size-3.5" />;
  if (passed) return <Check className="text-bull size-3.5" />;
  return <X className="text-bear size-3.5" />;
}

export function PersonaMatrix({
  scorecards,
  analysis,
  booksReady,
  analyzing,
}: {
  scorecards: PersonaScorecard[];
  analysis: IcAnalysis | null;
  booksReady: boolean;
  analyzing: boolean;
}) {
  const { t } = useI18n();
  if (!analysis && !analyzing) {
    return (
      <Card className="bg-card border-border border-dashed">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Sparkles className="text-bull size-6" />
          <p className="text-lg font-medium">{t("pressRun")}</p>
          <p className="text-muted-foreground max-w-lg text-sm leading-relaxed">{t("pressRunHint")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {scorecards.map((card) => {
        const narrative = analysis?.narratives.find((n) => n.id === card.id);
        return (
          <Card key={card.id} className="bg-card border-border overflow-hidden">
            <CardHeader className="gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{card.name}</CardTitle>
                  <p className="text-muted-foreground text-xs">{card.assetClass}</p>
                </div>
                {narrative ? (
                  <div className="shrink-0 text-right">
                    <div className="font-financial text-xl">{Math.round(narrative.conviction)}</div>
                    <div className={`text-xs font-medium ${voteTone(narrative.vote)}`}>
                      {voteLabel(narrative.vote)}
                    </div>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="min-w-0 space-y-4">
              {analyzing && !narrative ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  {t("generatingMemo")}
                </div>
              ) : null}
              {booksReady && narrative ? (
                <ul className="space-y-2">
                  {card.checks.map((check) => (
                    <li key={check.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Status passed={check.passed} />
                        {check.label}
                      </span>
                      <span className="font-financial text-muted-foreground shrink-0 text-xs">
                        {formatActual(check)} · {check.target}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {narrative ? (
                <div className="min-w-0 space-y-3">
                  <p className="text-sm leading-relaxed break-words">{narrative.argument}</p>
                  <div>
                    <div className="text-muted-foreground mb-1 text-[10px] tracking-[0.14em] uppercase">
                      {t("valuation")}
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed break-words">
                      {narrative.valuationTake}
                    </p>
                  </div>
                  <ul className="text-muted-foreground list-disc space-y-1.5 pl-4 text-sm leading-relaxed">
                    {narrative.thesis.map((line) => (
                      <li key={line} className="break-words">
                        {line}
                      </li>
                    ))}
                  </ul>
                  <div>
                    <div className="text-muted-foreground mb-1 text-[10px] tracking-[0.14em] uppercase">
                      {t("catalysts")}
                    </div>
                    <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-sm leading-relaxed">
                      {narrative.catalysts.map((item) => (
                        <li key={item} className="break-words">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1 text-[10px] tracking-[0.14em] uppercase">
                      {t("risks")}
                    </div>
                    <ul className="text-caution list-disc space-y-1 pl-4 text-sm leading-relaxed">
                      {narrative.risks.map((risk) => (
                        <li key={risk} className="break-words">
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
