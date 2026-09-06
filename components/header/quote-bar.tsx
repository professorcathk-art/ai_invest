"use client";

import type { Quote } from "@/lib/engines/types";
import { formatCompact, formatMultiple, formatNumber, formatPrice } from "@/lib/format";
import { useI18n } from "@/components/i18n/provider";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[7rem]">
      <div className="text-muted-foreground text-[10px] tracking-[0.14em] uppercase">{label}</div>
      <div className="font-financial text-sm">{value}</div>
    </div>
  );
}

export function QuoteBar({ quote }: { quote: Quote }) {
  const { t } = useI18n();
  return (
    <div className="border-border bg-card flex flex-wrap items-end gap-6 rounded-xl border px-5 py-3">
      <div>
        <div className="font-financial text-bull text-2xl font-semibold tracking-tight">
          {quote.ticker}
        </div>
        <div className="text-muted-foreground text-xs">{quote.name}</div>
        <div className="text-muted-foreground mt-1 text-[10px] tracking-[0.14em] uppercase">
          {quote.currency}
        </div>
      </div>
      <Stat label={`${t("price")} (${quote.currency})`} value={formatPrice(quote.price, quote.currency)} />
      <Stat label={t("mktCap")} value={formatCompact(quote.marketCap, 1, quote.currency)} />
      <Stat label={t("ev")} value={formatCompact(quote.enterpriseValue, 1, quote.currency)} />
      <Stat label={t("pe")} value={quote.pe ? formatNumber(quote.pe, 1) : "—"} />
      <Stat label={t("evEbitda")} value={quote.evEbitda ? formatMultiple(quote.evEbitda) : "—"} />
      <Stat label={t("beta")} value={quote.beta ? formatNumber(quote.beta, 2) : "—"} />
    </div>
  );
}
