import type { CompanyFinancials, LboResult, LboScenario, LboYear, SliderAssumptions } from "./types";
import { floorNonNeg, latest } from "./math";

const HOLD_YEARS = 5;
const INTEREST_RATE = 0.065;
const PAYDOWN_RATE = 0.05;

function buildScenario(
  name: LboScenario["name"],
  label: string,
  entryEv: number,
  entryDebt: number,
  entryEquity: number,
  startEbitda: number,
  growth: number,
  ebitdaScale: number,
  exitMultiple: number,
): LboScenario {
  const years: LboYear[] = [];
  let debt = entryDebt;
  let ebitda = startEbitda;

  for (let i = 1; i <= HOLD_YEARS; i += 1) {
    ebitda = startEbitda * (1 + growth) ** i * ebitdaScale;
    const openingDebt = debt;
    const interest = openingDebt * INTEREST_RATE;
    const principal = openingDebt * PAYDOWN_RATE;
    const endingDebt = Math.max(openingDebt - principal, 0);
    years.push({
      year: i,
      ebitda,
      openingDebt,
      interest,
      principal,
      endingDebt,
    });
    debt = endingDebt;
  }

  const year5 = years.at(-1)!;
  const exitEv = year5.ebitda * exitMultiple;
  const exitEquity = floorNonNeg(exitEv - year5.endingDebt);
  const moic = floorNonNeg(entryEquity > 0 ? exitEquity / entryEquity : 0);
  const irr = moic > 0 ? moic ** (1 / HOLD_YEARS) - 1 : 0;

  return {
    name,
    label,
    entryEquity,
    exitEv,
    exitEquity,
    endingDebt: year5.endingDebt,
    moic,
    irr,
    years,
  };
}

export function runLbo(financials: CompanyFinancials, sliders: SliderAssumptions): LboResult {
  const last = latest(financials.years);
  const entryEbitda = Math.max(last.ebitda, 1);
  const entryMultiple =
    financials.quote.evEbitda && financials.quote.evEbitda > 0
      ? financials.quote.evEbitda
      : sliders.exitMultiple;
  const entryEv =
    financials.quote.enterpriseValue > 0
      ? financials.quote.enterpriseValue
      : entryEbitda * entryMultiple;
  const entryDebt = entryEv * sliders.debtPct;
  const entryEquity = entryEv - entryDebt;

  const histGrowth = (() => {
    const ebitdas = financials.years.map((y) => y.ebitda).filter((e) => e > 0);
    if (ebitdas.length < 2) return 0.05;
    const start = ebitdas[0]!;
    const end = ebitdas.at(-1)!;
    return Math.min(0.25, Math.max(-0.1, (end / start) ** (1 / (ebitdas.length - 1)) - 1));
  })();

  const exitMultiple = sliders.exitMultiple;

  return {
    entryEv,
    entryEbitda,
    entryMultiple,
    entryDebt,
    entryEquity,
    interestRate: INTEREST_RATE,
    paydownRate: PAYDOWN_RATE,
    exitMultiple,
    base: buildScenario(
      "base",
      "Base (100%)",
      entryEv,
      entryDebt,
      entryEquity,
      entryEbitda,
      histGrowth,
      1,
      exitMultiple,
    ),
    bull: buildScenario(
      "bull",
      "Bull (+15% EBITDA)",
      entryEv,
      entryDebt,
      entryEquity,
      entryEbitda,
      histGrowth,
      1.15,
      exitMultiple,
    ),
    bear: buildScenario(
      "bear",
      "Bear (−15% EBITDA)",
      entryEv,
      entryDebt,
      entryEquity,
      entryEbitda,
      histGrowth,
      0.85,
      exitMultiple,
    ),
  };
}
