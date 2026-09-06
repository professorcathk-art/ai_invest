import type { CompanyFinancials, SliderAssumptions } from "@/lib/engines/types";
import type { Locale } from "@/lib/i18n/messages";

export async function readEnginePayload(request: Request): Promise<
  | { financials: CompanyFinancials; sliders: SliderAssumptions; locale: Locale }
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
  const { financials, sliders, locale } = body as {
    financials?: CompanyFinancials;
    sliders?: SliderAssumptions;
    locale?: string;
  };
  if (!financials?.quote?.ticker || !Array.isArray(financials.years) || !sliders) {
    return { error: "financials and sliders are required", status: 400 };
  }
  return { financials, sliders, locale: locale === "zh" ? "zh" : "en" };
}
