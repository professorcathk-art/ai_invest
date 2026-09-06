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
  allowZero = false,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return allowZero ? currency(0, 0, code) : "—";
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
  if (value == null || !Number.isFinite(value) || value === 0) return "—";
  return currency(value, Math.abs(value) >= 1000 ? 0 : 2, code);
}

/** Unambiguous for the LLM: "HKD 154.50" or "-HKD 101.99". Never drop the minus. */
export function formatMoney(value: number | null | undefined, code = "USD"): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "—";
  const iso = moneyCode(code);
  const digits = Math.abs(value) >= 1000 ? 0 : 2;
  const sign = value < 0 ? "-" : "";
  return `${sign}${iso} ${Math.abs(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}

export function formatMoneyCompact(value: number | null | undefined, code = "USD"): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "—";
  const iso = moneyCode(code);
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${iso} ${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}${iso} ${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${iso} ${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${iso} ${(abs / 1e3).toFixed(1)}K`;
  return formatMoney(value, iso);
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function varianceVsMarket(implied: number, market: number): number | null {
  if (!(implied > 0) || !(market > 0)) return null;
  return implied / market - 1;
}

export function heatBand(implied: number, market: number): "green" | "amber" | "red" | "muted" {
  if (!(market > 0) || !Number.isFinite(implied)) return "muted";
  const vs = implied / market - 1;
  if (vs > 0.1) return "green";
  if (vs >= -0.1) return "amber";
  return "red";
}

export const HEAT_COLORS = {
  green: { background: "#10B981", color: "#052e16" },
  amber: { background: "#F59E0B", color: "#451a03" },
  red: { background: "#EF4444", color: "#ffffff" },
  muted: { background: "#374151", color: "#e5e7eb" },
} as const;

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
