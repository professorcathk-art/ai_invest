-- Smart-money snapshots: HK CCASS broker flows and US 13F / Form 4 / short interest.
-- RLS on, no public policies — service role only (same pattern as financial_snapshots).

create table if not exists public.ownership_snapshots (
  id uuid primary key default gen_random_uuid(),
  ticker varchar(20) not null,
  as_of_date date not null,
  market_type varchar(10) not null default 'HK',

  institutional_pct numeric(5, 2),
  retail_pct numeric(5, 2),

  inst_holding_pct numeric(5, 2),
  insider_holding_pct numeric(5, 2),
  short_interest_pct numeric(5, 2),
  net_insider_usd numeric,

  top_buyers jsonb not null default '[]'::jsonb,
  top_sellers jsonb not null default '[]'::jsonb,
  signal_type varchar(50) not null,

  created_at timestamptz not null default now(),
  unique (ticker, as_of_date)
);

create index if not exists idx_ownership_ticker_date
  on public.ownership_snapshots (ticker, as_of_date desc);

alter table public.ownership_snapshots enable row level security;
