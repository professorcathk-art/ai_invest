import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { metricsBrief } from "./prompts";
import {
  icAnalysisSchema,
  personaNarrativeSchema,
  type IcAnalysis,
} from "./schemas";
import type { EngineBundle } from "@/lib/engines/types";
import { contextBrief, type CompanyContext } from "@/lib/data/context";
import type { Locale } from "@/lib/i18n/messages";
import { z } from "zod";

Object.defineProperty(globalThis, "AI_SDK_LOG_WARNINGS", {
  value: false,
  writable: true,
});

export const PERSONAS = [
  {
    id: "buffett" as const,
    name: "Warren Buffett",
    lens: `Think as Warren Buffett writing an IC memo. Focus on owner earnings, durable moat, predictability, capital allocation, and margin of safety. Ask: would I be happy owning the whole company at this price for 10 years? Cite DCF upside, ROIC, FCF history, and leverage. Use recent headlines only as color, not as a substitute for cash.`,
  },
  {
    id: "thiel" as const,
    name: "Peter Thiel",
    lens: `Think as Peter Thiel. Competition is for losers. Look for 10x technology, monopoly, network effects, proprietary insight. Contrast incremental growth with zero-to-one. Gross margin and YoY vs the 40%/70% bars. If this is a bank or a commodity franchise, say so plainly.`,
  },
  {
    id: "pe" as const,
    name: "PE Partner (KKR / Blackstone)",
    lens: `Think as a buyout partner. Underwrite cash conversion, debt service at 6.5%, 5% paydown, base/bull/bear IRR and MoIC vs 20% / 2.5x. Discuss cost-out, multiple contraction, and whether the capital structure survives a 15% EBITDA miss.`,
  },
  {
    id: "dalio" as const,
    name: "Ray Dalio",
    lens: `Think as Ray Dalio. Map the company to the economic machine: inflation, rates, credit, sovereign and supply-chain exposure. Stress the balance sheet (net debt/EBITDA). Do not vote the base case; vote the downturn.`,
  },
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
    temperature: 0.4,
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
    ? "Write EVERY string field in Simplified Chinese (简体中文). Keep JSON keys, ticker symbols, and numbers unchanged."
    : "Write all string fields in English.";
}

export async function generatePersonaNarrative(
  personaId: (typeof PERSONAS)[number]["id"],
  bundle: EngineBundle,
  ctx: CompanyContext,
  locale: Locale = "en",
): Promise<z.infer<typeof personaNarrativeSchema>> {
  const persona = PERSONAS.find((p) => p.id === personaId)!;
  const text = await complete(
    `You are ${persona.name} sitting in a live Investment Committee.
${persona.lens}
RULES:
- Use ONLY the supplied engine metrics and public context. Never invent financial figures or filings.
- Cite headlines or filings only if they appear in the supplied sources.
- Write a real memo, not a slogan. argument = 5–8 sentences. valuationTake = 3–4 sentences. Each thesis bullet = 2 sentences.
- ${languageRule(locale)}
- Return ONLY a JSON object with keys: id, vote ("strong_invest"|"conditional_invest"|"pass"), conviction (0-100 integer), thesis (3-5 strings), valuationTake, argument, catalysts (2-4), risks (2-4).
- vote is YOUR IC recommendation. conviction is how strongly you hold that vote.
- id must be "${persona.id}".`,
    `Company metrics (deterministic engines):\n${metricsBrief(bundle)}\n\nPublic context:\n${contextBrief(ctx)}`,
    1400,
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
): Promise<Pick<IcAnalysis, "debate" | "chairSummary">> {
  const digest = narratives
    .map(
      (n) =>
        `${n.id.toUpperCase()} vote=${n.vote} conviction=${n.conviction}: ${n.argument}\nValuation: ${n.valuationTake}`,
    )
    .join("\n\n");
  const text = await complete(
    `You are the IC secretary. Write a heated debate (6-8 turns) where Buffett, Thiel, the PE partner, and Dalio argue AGAINST each other using the engine figures and their votes. Each turn is 3–5 sentences. Then a 4–6 sentence chairSummary that states the consensus vote.
${languageRule(locale)}
Return ONLY JSON: { "debate": [{"speaker":"buffett"|"thiel"|"pe"|"dalio","text":"..."}], "chairSummary":"..." }`,
    `Persona memos:\n${digest}\n\nMetrics:\n${metricsBrief(bundle)}\n\nPublic context:\n${contextBrief(ctx)}`,
    1600,
  );
  return debateSchema.parse(extractJson(text));
}

export async function generateIcAnalysis(
  bundle: EngineBundle,
  ctx: CompanyContext,
  locale: Locale = "en",
): Promise<IcAnalysis> {
  const results = await Promise.allSettled(
    PERSONAS.map((p) => generatePersonaNarrative(p.id, bundle, ctx, locale)),
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
  const { debate, chairSummary } = await generateDebate(ordered, bundle, ctx, locale);
  return icAnalysisSchema.parse({ narratives: ordered, debate, chairSummary });
}
