"use client";

import { Check, Loader2, Minus, Sparkles, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IcAnalysis } from "@/lib/llm/schemas";
import type { PersonaScorecard } from "@/lib/engines/types";
import { formatMultiple, formatNumber, formatPct, voteTone } from "@/lib/format";
import { CHECK_I18N, type MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/provider";

function formatActual(check: PersonaScorecard["checks"][number]): string {
  const value = check.actual;
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (check.format === "years") return `${value} / 5`;
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
  const voteText = (vote: "strong_invest" | "conditional_invest" | "pass") =>
    vote === "strong_invest" ? t("voteStrong") : vote === "conditional_invest" ? t("voteConditional") : t("votePass");

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
                    <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                      {t("conviction")}
                    </div>
                    <div className={`text-xs font-medium ${voteTone(narrative.vote)}`}>
                      {voteText(narrative.vote)}
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
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground text-left">
                        <th className="pb-2 pr-2 font-medium">{t("colMetric")}</th>
                        <th className="pb-2 pr-2 text-right font-medium">{t("colCompany")}</th>
                        <th className="pb-2 pr-2 text-right font-medium">{t("colHurdle")}</th>
                        <th className="pb-2 w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {card.checks.map((check) => (
                        <tr key={check.id} className="border-border/60 border-t">
                          <td className="py-1.5 pr-2">
                            {t((CHECK_I18N[check.id] ?? "colMetric") as MessageKey)}
                          </td>
                          <td className="font-financial py-1.5 pr-2 text-right">
                            {formatActual(check)}
                          </td>
                          <td className="text-muted-foreground font-financial py-1.5 pr-2 text-right">
                            {check.target}
                          </td>
                          <td className="py-1.5">
                            <Status passed={check.passed} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
