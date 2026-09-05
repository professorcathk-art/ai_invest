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
}: {
  onSelect: (symbol: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/ticker/search?q=${encodeURIComponent(query)}`);
      const json = (await res.json()) as { results: Hit[] };
      setHits(json.results ?? []);
      setOpen(true);
    }, 180);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <Popover open={open && hits.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative w-full max-w-md">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            disabled={disabled}
            placeholder="Search ticker — AAPL, NVDA, 0700.HK"
            className="bg-card border-border h-11 pl-9 font-mono tracking-wide"
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onFocus={() => hits.length && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                onSelect(query.trim());
                setOpen(false);
              }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-1" align="start">
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
