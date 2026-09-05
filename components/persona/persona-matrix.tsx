"use client";

import { Check, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IcAnalysis } from "@/lib/llm/schemas";
import type { PersonaScorecard } from "@/lib/engines/types";
import { formatMultiple, formatPct, voteLabel, voteTone } from "@/lib/format";

function formatActual(value: PersonaScorecard["checks"][number]["actual"]): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value == null) return "—";
  if (Math.abs(value) <= 2) return formatPct(value);
  if (Math.abs(value) < 20) return formatMultiple(value);
  return value.toFixed(1);
}

function Status({ passed }: { passed: boolean | null }) {
  if (passed == null) return <Minus className="text-muted-foreground size-3.5" />;
  if (passed) return <Check className="text-bull size-3.5" />;
  return <X className="text-bear size-3.5" />;
}

export function PersonaMatrix({
  scorecards,
  analysis,
}: {
  scorecards: PersonaScorecard[];
  analysis: IcAnalysis | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {scorecards.map((card) => {
        const narrative = analysis?.narratives.find((n) => n.id === card.id);
        return (
          <Card key={card.id} className="bg-card border-border">
            <CardHeader className="gap-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{card.name}</CardTitle>
                  <p className="text-muted-foreground text-xs">{card.assetClass}</p>
                </div>
                <div className="text-right">
                  <div className="font-financial text-xl">{card.score}</div>
                  <div className={`text-xs font-medium ${voteTone(card.vote)}`}>
                    {voteLabel(card.vote)}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {card.checks.map((check) => (
                  <li key={check.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <Status passed={check.passed} />
                      {check.label}
                    </span>
                    <span className="font-financial text-muted-foreground text-xs">
                      {formatActual(check.actual)} · {check.target}
                    </span>
                  </li>
                ))}
              </ul>
              {narrative ? (
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed">{narrative.argument}</p>
                  <div>
                    <div className="text-muted-foreground mb-1 text-[10px] tracking-[0.14em] uppercase">
                      Valuation
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {narrative.valuationTake}
                    </p>
                  </div>
                  <ul className="text-muted-foreground list-disc space-y-1.5 pl-4 text-sm leading-relaxed">
                    {narrative.thesis.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <div>
                    <div className="text-muted-foreground mb-1 text-[10px] tracking-[0.14em] uppercase">
                      Catalysts
                    </div>
                    <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
                      {narrative.catalysts.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {narrative.risks.map((risk) => (
                      <Badge key={risk} variant="outline" className="text-caution border-caution/40">
                        {risk}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Run IC analysis to overlay persona narrative on these engine checks.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
