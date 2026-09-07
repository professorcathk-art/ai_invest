"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/provider";
import { readRecentTickers } from "@/lib/recent-tickers";

const RECENT_EVENT = "investmouse-recent";

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(RECENT_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(RECENT_EVENT, onStoreChange);
  };
}

function snapshot(): string {
  return JSON.stringify(readRecentTickers());
}

export function RecentTickers({
  onSelect,
  tickers,
}: {
  onSelect: (symbol: string) => void;
  tickers?: string[];
}) {
  const { t } = useI18n();
  const stored = JSON.parse(useSyncExternalStore(subscribe, snapshot, () => "[]")) as string[];
  const list = tickers ?? stored;
  if (!list.length) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-[10px] tracking-[0.16em] uppercase">
        {t("recentViewed")}
      </span>
      {list.map((symbol) => (
        <button
          key={symbol}
          type="button"
          onClick={() => onSelect(symbol)}
          className="border-border bg-muted/40 hover:border-bull/50 hover:text-bull font-financial rounded-full border px-2 py-0.5 text-[11px]"
        >
          {symbol}
        </button>
      ))}
    </div>
  );
}
