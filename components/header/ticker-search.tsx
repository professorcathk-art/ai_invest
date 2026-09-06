"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";

interface Hit {
  symbol: string;
  name: string;
  exchange: string;
}

export function TickerSearch({
  onSelect,
  disabled,
  variant = "default",
  placeholder = "Search ticker — AAPL, NVDA, 0700.HK",
}: {
  onSelect: (symbol: string) => void;
  disabled?: boolean;
  variant?: "default" | "hero";
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/ticker/search?q=${encodeURIComponent(q)}`);
      const json = (await res.json()) as { results: Hit[] };
      setHits(json.results ?? []);
      setOpen((json.results ?? []).length > 0);
    }, 180);
    return () => clearTimeout(handle);
  }, [q]);

  return (
    <Popover open={Boolean(q) && open && hits.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={`relative w-full ${variant === "hero" ? "max-w-2xl" : "max-w-md"}`}>
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            disabled={disabled}
            placeholder={placeholder}
            className={`bg-card border-border pl-9 font-mono tracking-wide ${
              variant === "hero"
                ? "h-14 rounded-2xl text-base shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
                : "h-11"
            }`}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onFocus={() => {
              if (q && hits.length) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q) {
                onSelect(q);
                setOpen(false);
              }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        className={`${variant === "hero" ? "w-[min(42rem,calc(100vw-2rem))]" : "w-[min(28rem,calc(100vw-2rem))]"} p-1`}
        align={variant === "hero" ? "center" : "start"}
      >
        {hits.map((hit) => (
          <button
            key={hit.symbol}
            type="button"
            className="hover:bg-muted flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm"
            onClick={() => {
              onSelect(hit.symbol);
              setQuery(hit.symbol);
              setOpen(false);
            }}
          >
            <span className="font-financial text-bull">{hit.symbol}</span>
            <span className="text-muted-foreground truncate pl-4">{hit.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
