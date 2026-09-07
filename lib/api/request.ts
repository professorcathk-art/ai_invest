import type { CompanyFinancials, SliderAssumptions } from "@/lib/engines/types";
import type { AnalysisDepth, Locale } from "@/lib/i18n/messages";
import { normalizeSelectedPersonas, type PersonaId } from "@/lib/llm/persona-ids";

export async function readEnginePayload(request: Request): Promise<
  | {
      financials: CompanyFinancials;
      sliders: SliderAssumptions;
      locale: Locale;
      depth: AnalysisDepth;
      selectedPersonas: PersonaId[];
      narratives?: unknown;
    }
  | { error: string; status: 400 }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: "Invalid JSON body", status: 400 };
  }
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object", status: 400 };
  }
  const { financials, sliders, locale, depth, narratives, selected_personas } = body as {
    financials?: CompanyFinancials;
    sliders?: SliderAssumptions;
    locale?: string;
    depth?: string;
    narratives?: unknown;
    selected_personas?: unknown;
  };
  if (!financials?.quote?.ticker || !Array.isArray(financials.years) || !sliders) {
    return { error: "financials and sliders are required", status: 400 };
  }
  return {
    financials,
    sliders,
    locale: locale === "zh" ? "zh" : "en",
    depth: depth === "professional" ? "professional" : "concise",
    selectedPersonas: normalizeSelectedPersonas(selected_personas),
    narratives,
  };
}
