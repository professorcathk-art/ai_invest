"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonaScorecard, Vote } from "@/lib/engines/types";
import type { IcAnalysis } from "@/lib/llm/schemas";
import { majorityVote, NAMES } from "@/lib/llm/personas";
import { voteTone } from "@/lib/format";
import { useI18n } from "@/components/i18n/provider";

const ACCENT: Record<string, string> = {
  buffett: "border-l-bull",
  thiel: "border-l-tech",
  pe: "border-l-caution",
  dalio: "border-l-bear",
  expert: "border-l-tech",
  trump: "border-l-caution",
  musk: "border-l-tech",
};

export function IcDebate({
  scorecards,
  analysis,
  streaming,
}: {
  scorecards: PersonaScorecard[];
  analysis: IcAnalysis | null;
  streaming?: boolean;
  booksReady?: boolean;
}) {
  const { t } = useI18n();
  const voteText = (vote: Vote) =>
    vote === "strong_invest" ? t("voteStrong") : vote === "conditional_invest" ? t("voteConditional") : t("votePass");
  const votes = analysis?.narratives.map((n) => n.vote) ?? [];
  const verdict: Vote | null = votes.length >= 2 ? majorityVote(votes) : null;
  const turns = analysis?.debate ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="bg-card border-border min-w-0">
        <CardHeader>
          <CardTitle className="text-sm">
            {t("debateTitle")} {streaming ? <span className="text-tech">· {t("debateGenerating")}</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {streaming && turns.length === 0 ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                {t("debateAgents")}
              </div>
            ) : null}
            {!streaming && turns.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("debateWait")}</p>
            ) : null}
            {turns.map((turn, i) => (
              <div
                key={`${turn.speaker}-${i}`}
                className={`border-border bg-background/50 rounded-lg border border-l-4 p-3 ${ACCENT[turn.speaker] ?? ""}`}
              >
                <div className="mb-1 text-xs font-medium tracking-wide uppercase">
                  {NAMES[turn.speaker]}
                </div>
                <p className="text-sm leading-relaxed break-words">{turn.text}</p>
              </div>
            ))}
            {analysis?.chairSummary ? (
              <p className="text-muted-foreground pt-2 text-sm leading-relaxed break-words italic">
                {analysis.chairSummary}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card className="bg-card border-border h-fit min-w-0">
        <CardHeader>
          <CardTitle className="text-sm">{t("voting")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {verdict ? (
            <>
              <div>
                <div className="text-muted-foreground text-[10px] tracking-[0.14em] uppercase">
                  {t("majority")}
                </div>
                <div className={`font-financial text-2xl ${voteTone(verdict)}`}>{voteText(verdict)}</div>
              </div>
              <ul className="space-y-2">
                {analysis?.narratives.map((n) => {
                  const name = scorecards.find((s) => s.id === n.id)?.name ?? n.id;
                  return (
                    <li key={n.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{name}</span>
                      <Badge variant="outline" className={`max-w-[9rem] shrink-0 ${voteTone(n.vote)}`}>
                        {voteText(n.vote)}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t("votesAfter")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
