function moneyCode(code?: string): string {
  const raw = (code || "USD").toUpperCase();
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: raw }).format(0);
    return raw;
  } catch {
    return "USD";
  }
}

function currency(value: number, digits = 2, code = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: moneyCode(code),
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatCompact(
  value: number | null | undefined,
  digits = 1,
  code = "USD",
): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const sample = currency(1, 0, code);
  const symbol = sample.replace(/[\d.,\s]/g, "");
  if (abs >= 1e12) return `${sign}${symbol}${(abs / 1e12).toFixed(digits)}T`;
  if (abs >= 1e9) return `${sign}${symbol}${(abs / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${sign}${symbol}${(abs / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${sign}${symbol}${(abs / 1e3).toFixed(digits)}K`;
  return currency(value, 0, code);
}

export function formatPrice(value: number | null | undefined, code = "USD"): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  return currency(value, value >= 1000 ? 0 : 2, code);
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatMultiple(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}x`;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function voteLabel(vote: "strong_invest" | "conditional_invest" | "pass"): string {
  if (vote === "strong_invest") return "Strong Invest";
  if (vote === "conditional_invest") return "Conditional Invest";
  return "Pass";
}

export function voteTone(vote: "strong_invest" | "conditional_invest" | "pass"): string {
  if (vote === "strong_invest") return "text-bull";
  if (vote === "conditional_invest") return "text-caution";
  return "text-bear";
}
