-- PersonaVal v1: server-only cache + analysis snapshots.
-- RLS enabled with no public policies; access is via service_role.

create table if not exists public.financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  source text not null,
  quote jsonb not null,
  statements jsonb not null,
  warnings jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index if not exists financial_snapshots_ticker_uidx
  on public.financial_snapshots (ticker);

create index if not exists financial_snapshots_expires_idx
  on public.financial_snapshots (expires_at);

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  assumptions jsonb not null,
  engines jsonb not null,
  personas jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists analyses_ticker_created_idx
  on public.analyses (ticker, created_at desc);

alter table public.financial_snapshots enable row level security;
alter table public.analyses enable row level security;
