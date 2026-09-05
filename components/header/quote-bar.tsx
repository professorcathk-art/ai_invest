"use client";

import type { Quote } from "@/lib/engines/types";
import { formatCompact, formatMultiple, formatNumber, formatPrice } from "@/lib/format";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[7rem]">
      <div className="text-muted-foreground text-[10px] tracking-[0.14em] uppercase">{label}</div>
      <div className="font-financial text-sm">{value}</div>
    </div>
  );
}

export function QuoteBar({ quote }: { quote: Quote }) {
  return (
    <div className="border-border bg-card flex flex-wrap items-end gap-6 rounded-xl border px-5 py-3">
      <div>
        <div className="font-financial text-bull text-2xl font-semibold tracking-tight">
          {quote.ticker}
        </div>
        <div className="text-muted-foreground text-xs">{quote.name}</div>
      </div>
      <Stat label="Price" value={formatPrice(quote.price)} />
      <Stat label="Mkt Cap" value={formatCompact(quote.marketCap)} />
      <Stat label="EV" value={formatCompact(quote.enterpriseValue)} />
      <Stat label="P/E" value={formatNumber(quote.pe, 1)} />
      <Stat label="EV/EBITDA" value={formatMultiple(quote.evEbitda)} />
      <Stat label="Beta" value={formatNumber(quote.beta, 2)} />
    </div>
  );
}
