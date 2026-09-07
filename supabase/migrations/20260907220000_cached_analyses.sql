-- 72-hour IC memo cache. Distinct from append-only public.analyses.
-- RLS on, no public policies — service role only.

create table if not exists public.cached_analyses (
  id uuid primary key default gen_random_uuid(),
  ticker varchar(20) not null,
  mode varchar(20) not null,
  personas_hash varchar(64) not null,
  locale varchar(8) not null default 'en',
  assumptions_hash varchar(64) not null default '',
  analysis_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cache_ticker_mode
  on public.cached_analyses (ticker, mode, created_at desc);

create index if not exists idx_cache_lookup
  on public.cached_analyses (ticker, mode, personas_hash, locale, assumptions_hash, created_at desc);

alter table public.cached_analyses enable row level security;
