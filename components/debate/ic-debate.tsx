"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PersonaScorecard, Vote } from "@/lib/engines/types";
import type { IcAnalysis } from "@/lib/llm/schemas";
import { majorityVote, NAMES } from "@/lib/llm/personas";
import { voteLabel, voteTone } from "@/lib/format";

const ACCENT: Record<string, string> = {
  buffett: "border-l-bull",
  thiel: "border-l-tech",
  pe: "border-l-caution",
  dalio: "border-l-bear",
};

export function IcDebate({
  scorecards,
  analysis,
  streaming,
  booksReady,
}: {
  scorecards: PersonaScorecard[];
  analysis: IcAnalysis | null;
  streaming?: boolean;
  booksReady: boolean;
}) {
  const verdict: Vote | null = booksReady && analysis ? majorityVote(scorecards.map((s) => s.vote)) : null;
  const turns = analysis?.debate ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm">
            IC Debate Room {streaming ? <span className="text-tech">· generating</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[28rem] pr-3">
            <div className="space-y-3">
              {streaming && turns.length === 0 ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Four agents are writing memos, then the secretary will draft the debate.
                </div>
              ) : null}
              {!streaming && turns.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Press Run IC analysis to generate a live debate. Nothing is shown until DeepSeek
                  finishes.
                </p>
              ) : null}
              {turns.map((turn, i) => (
                <div
                  key={`${turn.speaker}-${i}`}
                  className={`border-border bg-background/50 rounded-lg border border-l-4 p-3 ${ACCENT[turn.speaker] ?? ""}`}
                >
                  <div className="mb-1 text-xs font-medium tracking-wide uppercase">
                    {NAMES[turn.speaker]}
                  </div>
                  <p className="text-sm leading-relaxed">{turn.text}</p>
                </div>
              ))}
              {analysis?.chairSummary ? (
                <p className="text-muted-foreground pt-2 text-sm italic">{analysis.chairSummary}</p>
              ) : null}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      <Card className="bg-card border-border h-fit">
        <CardHeader>
          <CardTitle className="text-sm">IC Voting Card</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {verdict ? (
            <>
              <div>
                <div className="text-muted-foreground text-[10px] tracking-[0.14em] uppercase">
                  Majority verdict
                </div>
                <div className={`font-financial text-2xl ${voteTone(verdict)}`}>{voteLabel(verdict)}</div>
              </div>
              <ul className="space-y-2">
                {scorecards.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <span>{s.name}</span>
                    <Badge variant="outline" className={voteTone(s.vote)}>
                      {voteLabel(s.vote)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Votes appear after IC analysis finishes with usable financials. Nothing is shown
              before that.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
