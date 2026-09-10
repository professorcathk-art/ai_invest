import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { factPacket, languageRule, metricsBrief } from "./prompts";
import { personaSystemPrompt } from "@/lib/persona-prompts";
import {
  icAnalysisSchema,
  personaNarrativeSchema,
  type IcAnalysis,
} from "./schemas";
import { PERSONA_LENSES } from "./lenses";
import {
  debateMode,
  debateSystemPrompt,
  debateTurnBounds,
  isValidDebateLength,
  normalizeDebateOutput,
  speakerSequence,
  votingResults,
} from "./debate";
import type { EngineBundle } from "@/lib/engines/types";
import { contextBrief, type CompanyContext } from "@/lib/data/context";
import type { AnalysisDepth, Locale } from "@/lib/i18n/messages";
import { DEFAULT_PERSONA_IDS, type PersonaId } from "./persona-ids";
import type { z } from "zod";

Object.defineProperty(globalThis, "AI_SDK_LOG_WARNINGS", {
  value: false,
  writable: true,
});

export const PERSONAS = [
  { id: "buffett" as const, name: "Warren Buffett", lens: PERSONA_LENSES.buffett },
  { id: "thiel" as const, name: "Peter Thiel", lens: PERSONA_LENSES.thiel },
  { id: "pe" as const, name: "PE Partner (KKR / Blackstone)", lens: PERSONA_LENSES.pe },
  { id: "dalio" as const, name: "Ray Dalio", lens: PERSONA_LENSES.dalio },
  { id: "expert" as const, name: "Industry expert", lens: PERSONA_LENSES.expert },
  { id: "trump" as const, name: "Donald Trump", lens: PERSONA_LENSES.trump },
  { id: "musk" as const, name: "Elon Musk", lens: PERSONA_LENSES.musk },
];

export function personasFor(ids: readonly PersonaId[]) {
  const wanted = new Set(ids);
  return PERSONAS.filter((p) => wanted.has(p.id));
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

function modelId(): string {
  return process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
}

async function complete(
  system: string,
  prompt: string,
  maxOutputTokens: number,
  temperature = 0.35,
): Promise<string> {
  const { text } = await generateText({
    model: deepseek(modelId()),
    system,
    prompt,
    maxRetries: 0,
    maxOutputTokens,
    temperature,
    providerOptions: {
      deepseek: {
        thinking: { type: "disabled" },
      },
    },
  });
  return text;
}

function depthTokens(depth: AnalysisDepth): number {
  return depth === "professional" ? 1800 : 1100;
}

export async function generatePersonaNarrative(
  personaId: (typeof PERSONAS)[number]["id"],
  bundle: EngineBundle,
  ctx: CompanyContext,
  locale: Locale = "en",
  depth: AnalysisDepth = "concise",
): Promise<z.infer<typeof personaNarrativeSchema>> {
  const persona = PERSONAS.find((p) => p.id === personaId)!;
  const text = await complete(
    personaSystemPrompt(persona.id, locale, depth),
    factPacket(bundle, ctx),
    depthTokens(depth),
  );
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== "object") throw new Error("Persona JSON was not an object");
  const raw = parsed as Record<string, unknown>;
  const vote =
    raw.vote === "strong_invest" || raw.vote === "conditional_invest" || raw.vote === "pass"
      ? raw.vote
      : "pass";
  return personaNarrativeSchema.parse({
    ...raw,
    id: personaId,
    vote,
    conviction: Math.min(100, Math.max(0, Math.round(Number(raw.conviction ?? 50)))),
  });
}

const debateSchema = icAnalysisSchema.pick({ debate: true, chairSummary: true });

function debateTokens(mode: ReturnType<typeof debateMode>, depth: AnalysisDepth): number {
  if (mode === "split") return depth === "professional" ? 2200 : 1700;
  return depth === "professional" ? 1100 : 800;
}

export async function generateDebate(
  narratives: IcAnalysis["narratives"],
  bundle: EngineBundle,
  ctx: CompanyContext,
  locale: Locale = "en",
  depth: AnalysisDepth = "concise",
): Promise<Pick<IcAnalysis, "debate" | "chairSummary">> {
  const votes = votingResults(narratives);
  const mode = debateMode(votes);
  const { target, min, max } = debateTurnBounds(mode);
  const sequence = speakerSequence(narratives, votes, target);
  const digest = narratives
    .map(
      (n) =>
        `${n.id.toUpperCase()} vote=${n.vote} verdict=${votes[n.id]} conviction=${n.conviction}\nThesis: ${n.thesis.join(" | ")}\nArgument: ${n.argument}\nValuation: ${n.valuationTake}\nCatalysts: ${n.catalysts.join("; ")}\nRisks: ${n.risks.join("; ")}`,
    )
    .join("\n\n");
  const text = await complete(
    `${debateSystemPrompt(votes, sequence)}
CURRENCY: Use company.reportingCurrency only. Never convert .HK names into USD. Never paste raw headline titles.
${languageRule(locale)}
Return ONLY JSON: { "debate": [{"speaker":"buffett"|"thiel"|"pe"|"dalio"|"expert"|"trump"|"musk","text":"..."}], "chairSummary":"..." }`,
    `SPEAKER_SEQUENCE: ${sequence.join(" → ")}
TURN_COUNT: exactly ${target} (allowed ${min}-${max}).

SELECTED_NARRATIVES:
${digest}

FINANCIALS_AND_VALUATION_MODELS:
${metricsBrief(bundle)}

PROPRIETARY_INSIGHTS (CCASS / 13F / buybacks / headlines — use only these figures; do not invent holdings):
${contextBrief(ctx)}`,
    debateTokens(mode, depth),
    0.45,
  );
  const normalized = normalizeDebateOutput(extractJson(text), votes);
  if (!isValidDebateLength(normalized.debate.length, mode) || !normalized.chairSummary) {
    throw new Error(
      `Debate output failed validation (${normalized.debate.length} turns, mode=${mode})`,
    );
  }
  return debateSchema.parse(normalized);
}

export async function generateIcAnalysis(
  bundle: EngineBundle,
  ctx: CompanyContext,
  locale: Locale = "en",
  depth: AnalysisDepth = "concise",
  selected: readonly PersonaId[] = DEFAULT_PERSONA_IDS,
): Promise<IcAnalysis> {
  const roster = personasFor(selected);
  const results = await Promise.allSettled(
    roster.map((p) => generatePersonaNarrative(p.id, bundle, ctx, locale, depth)),
  );
  const narratives = results
    .filter((r): r is PromiseFulfilledResult<IcAnalysis["narratives"][number]> => r.status === "fulfilled")
    .map((r) => r.value);
  if (narratives.length < roster.length) {
    const reasons = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : "failed"));
    throw new Error(`DeepSeek persona generation failed (${narratives.length}/${roster.length}). ${reasons[0] ?? ""}`);
  }
  const ordered = roster.map((p) => narratives.find((n) => n.id === p.id)).filter(
    (n): n is IcAnalysis["narratives"][number] => Boolean(n),
  );
  const { debate, chairSummary } = await generateDebate(ordered, bundle, ctx, locale, depth);
  return icAnalysisSchema.parse({ narratives: ordered, debate, chairSummary });
}
