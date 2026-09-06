export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Share prices, IRR and MoIC never print below zero. */
export function floorNonNeg(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function safeDiv(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

export function cagr(start: number, end: number, periods: number): number | null {
  if (periods <= 0 || start <= 0 || end <= 0) return null;
  return (end / start) ** (1 / periods) - 1;
}

export function yoy(prev: number, next: number): number | null {
  if (prev === 0 || !Number.isFinite(prev) || !Number.isFinite(next)) return null;
  return next / prev - 1;
}

export function round(value: number, digits = 6): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function linspace(center: number, deltas: number[], min: number, max: number): number[] {
  return deltas.map((d) => clamp(round(center + d, 6), min, max));
}

export function latest<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error("Empty series");
  return arr[arr.length - 1]!;
}

export function prev<T>(arr: T[]): T | undefined {
  return arr.length >= 2 ? arr[arr.length - 2] : undefined;
}

export function ufcf(input: {
  ebit: number;
  taxRate: number;
  da: number;
  capex: number;
  deltaNwc: number;
}): number {
  return input.ebit * (1 - input.taxRate) + input.da - input.capex - input.deltaNwc;
}

export function npv(rate: number, cashflows: number[]): number {
  return cashflows.reduce((sum, cf, i) => sum + cf / (1 + rate) ** (i + 1), 0);
}
