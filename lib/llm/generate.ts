import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { icSystemPrompt, languageRule, metricsBrief } from "./prompts";
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
];

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

function depthRule(depth: AnalysisDepth): { rule: string; tokens: number } {
  if (depth === "professional") {
    return {
      tokens: 1800,
      rule: `PROFESSIONAL MODE:
- Dense, high-conviction paragraphs. Open with the company, ticker, and spot price from the JSON.
- Cite at least FOUR engine figures with the exact printed values (price, DCF, IRR, margins, FCF, leverage).
- Synthesize at least one supplied headline as a BUSINESS EVENT or MARKET CATALYST. Never paste the raw title string.
- No generic lines such as "the moat looks durable" unless a number supports or kills that claim.
- If a metric is "—" or null, say the books are incomplete for that item.`,
    };
  }
  return {
    tokens: 1100,
    rule: `CONCISE MODE:
- Dense paragraphs, not sentence-count padding. Still cite at least three engine figures with exact values.
- Digest headlines into catalysts. Never dump raw headline titles.`,
  };
}

export async function generatePersonaNarrative(
  personaId: (typeof PERSONAS)[number]["id"],
  bundle: EngineBundle,
  ctx: CompanyContext,
  locale: Locale = "en",
  depth: AnalysisDepth = "concise",
): Promise<z.infer<typeof personaNarrativeSchema>> {
  const persona = PERSONAS.find((p) => p.id === personaId)!;
  const { rule, tokens } = depthRule(depth);
  const text = await complete(
    `You are ${persona.name} sitting in a live Investment Committee.
${icSystemPrompt()}

YOUR LENS
${persona.lens}

HARD RULES:
- Use ONLY the supplied engine JSON and public context. Never invent financial figures, headlines, or filings.
- QUALITATIVE FIRST: analyze business model, moat, supply chain or macro mechanics BEFORE quoting valuation figures.
- SYNTHESIS: weave business model + market catalysts (digested from headlines) + engine figures. Never recap numbers without saying what they mean for the vote.
- Follow your lens's 3-part structure inside argument (use \\n\\n between paragraphs).
- Never copy-paste raw headline title strings into prose.
- CURRENCY: company.reportingCurrency is the only money unit. Quote prices as "HKD 154.50", "-HKD 101.99", or "USD 190". Keep the minus on negative DCF / EV. Never convert, and never write USD / 美元 / $ unless reportingCurrency is USD. Hong Kong listings (.HK) are HKD.
- ${rule}
- ${languageRule(locale)}
- Return ONLY a JSON object with keys: id, vote ("strong_invest"|"conditional_invest"|"pass"), conviction (0-100 integer), thesis (3-5 strings), valuationTake, argument, catalysts (2-4), risks (2-4).
- vote is YOUR IC recommendation. conviction is how strongly you hold that vote.
- id must be "${persona.id}".`,
    `Company metrics (deterministic engines — quote these):\n${metricsBrief(bundle)}\n\nPublic context (digest headlines as events/catalysts; do not invent):\n${contextBrief(ctx)}`,
    tokens,
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
Return ONLY JSON: { "debate": [{"speaker":"buffett"|"thiel"|"pe"|"dalio","text":"..."}], "chairSummary":"..." }`,
    `SPEAKER_SEQUENCE: ${sequence.join(" → ")}
TURN_COUNT: exactly ${target} (allowed ${min}-${max}).

FOUR_NARRATIVES:
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
): Promise<IcAnalysis> {
  const results = await Promise.allSettled(
    PERSONAS.map((p) => generatePersonaNarrative(p.id, bundle, ctx, locale, depth)),
  );
  const narratives = results
    .filter((r): r is PromiseFulfilledResult<IcAnalysis["narratives"][number]> => r.status === "fulfilled")
    .map((r) => r.value);
  if (narratives.length < 4) {
    const reasons = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : "failed"));
    throw new Error(`DeepSeek persona generation failed (${narratives.length}/4). ${reasons[0] ?? ""}`);
  }
  const ordered = PERSONAS.map((p) => narratives.find((n) => n.id === p.id)).filter(
    (n): n is IcAnalysis["narratives"][number] => Boolean(n),
  );
  const { debate, chairSummary } = await generateDebate(ordered, bundle, ctx, locale, depth);
  return icAnalysisSchema.parse({ narratives: ordered, debate, chairSummary });
}
