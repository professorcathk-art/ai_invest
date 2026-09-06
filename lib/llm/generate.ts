import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { metricsBrief } from "./prompts";
import {
  icAnalysisSchema,
  personaNarrativeSchema,
  type IcAnalysis,
} from "./schemas";
import { PERSONA_LENSES } from "./lenses";
import type { EngineBundle } from "@/lib/engines/types";
import { contextBrief, type CompanyContext } from "@/lib/data/context";
import type { AnalysisDepth, Locale } from "@/lib/i18n/messages";
import { z } from "zod";

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

async function complete(system: string, prompt: string, maxOutputTokens: number): Promise<string> {
  const { text } = await generateText({
    model: deepseek(modelId()),
    system,
    prompt,
    maxRetries: 0,
    maxOutputTokens,
    temperature: 0.35,
    providerOptions: {
      deepseek: {
        thinking: { type: "disabled" },
      },
    },
  });
  return text;
}

function languageRule(locale: Locale): string {
  return locale === "zh"
    ? "Write EVERY string field in Traditional Chinese (繁體中文，香港／台灣用語). Keep JSON keys, ticker symbols, and Arabic numerals unchanged."
    : "Write all string fields in English.";
}

function depthRule(depth: AnalysisDepth): { rule: string; tokens: number } {
  if (depth === "professional") {
    return {
      tokens: 1800,
      rule: `PROFESSIONAL MODE:
- argument = 8–12 sentences. valuationTake = 5–7 sentences. Each thesis bullet = 2–3 sentences that include a number.
- First sentence must name the company, ticker, and spot price from the JSON.
- Quote at least FOUR engine figures with the exact printed values (price, DCF, IRR, margins, FCF years, leverage, etc.).
- Quote at least ONE headline or filing by its exact title from the supplied sources. If none exist, write "no usable headline was supplied".
- Do not write generic lines such as "the moat looks durable" unless you attach a number that supports or kills that claim.
- If a metric is "—" or null, say the books are incomplete for that item.`,
    };
  }
  return {
    tokens: 1100,
    rule: `CONCISE MODE:
- argument = 4–6 sentences. valuationTake = 2–3 sentences. Each thesis bullet = 1–2 sentences.
- Still cite at least three engine figures with exact values. No slogans without numbers.`,
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
${persona.lens}

HARD RULES:
- Use ONLY the supplied engine JSON and public context. Never invent financial figures, headlines, or filings.
- ${rule}
- ${languageRule(locale)}
- Return ONLY a JSON object with keys: id, vote ("strong_invest"|"conditional_invest"|"pass"), conviction (0-100 integer), thesis (3-5 strings), valuationTake, argument, catalysts (2-4), risks (2-4).
- vote is YOUR IC recommendation. conviction is how strongly you hold that vote.
- id must be "${persona.id}".`,
    `Company metrics (deterministic engines — quote these):\n${metricsBrief(bundle)}\n\nPublic context (cite titles, do not invent):\n${contextBrief(ctx)}`,
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

export async function generateDebate(
  narratives: IcAnalysis["narratives"],
  bundle: EngineBundle,
  ctx: CompanyContext,
  locale: Locale = "en",
  depth: AnalysisDepth = "concise",
): Promise<Pick<IcAnalysis, "debate" | "chairSummary">> {
  const digest = narratives
    .map(
      (n) =>
        `${n.id.toUpperCase()} vote=${n.vote} conviction=${n.conviction}: ${n.argument}\nValuation: ${n.valuationTake}`,
    )
    .join("\n\n");
  const length = depth === "professional" ? "Each turn is 4–6 sentences." : "Each turn is 3–4 sentences.";
  const text = await complete(
    `You are the IC secretary recording a LIVE argument, not four speeches.
STRUCTURE (mandatory, 6–8 turns):
1. Buffett opens with his vote and two engine figures.
2. Thiel replies to Buffett BY NAME, quotes one Buffett claim, and attacks it with a different figure.
3. PE replies to Thiel BY NAME and quotes Thiel.
4. Dalio replies to PE BY NAME.
5–8. Cross-fire. Every turn must start by naming the previous speaker and the claim being rejected.
FORBIDDEN: parallel monologues, "I agree with the group", or a turn that does not address someone else.
${length}
Then a 4–6 sentence chairSummary that states who won, who dissented, and what number would flip the majority.
${languageRule(locale)}
Return ONLY JSON: { "debate": [{"speaker":"buffett"|"thiel"|"pe"|"dalio","text":"..."}], "chairSummary":"..." }`,
    `Persona memos:\n${digest}\n\nMetrics:\n${metricsBrief(bundle)}\n\nPublic context:\n${contextBrief(ctx)}`,
    depth === "professional" ? 1800 : 1400,
  );
  return debateSchema.parse(extractJson(text));
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
