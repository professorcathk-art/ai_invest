import type { CompanyFinancials, EngineBundle, SliderAssumptions } from "./types";
import { runDcf } from "./dcf";
import { runLbo } from "./lbo";
import { runVc } from "./vc";
import { evaluatePersonas } from "./thresholds";
import { defaultSliders } from "./wacc";

export function runEngines(
  financials: CompanyFinancials,
  sliders: SliderAssumptions,
): EngineBundle {
  const dcf = runDcf(financials, sliders);
  const lbo = runLbo(financials, sliders);
  const vc = runVc(financials);
  const personas = evaluatePersonas(vc, lbo, dcf);
  return { financials, sliders, dcf, lbo, vc, personas };
}

export { defaultSliders, runDcf, runLbo, runVc, evaluatePersonas };
export * from "./types";
