-- Daily HKEX short-selling turnover (ASHT/MSHT files). Not US short interest % of float.
-- RLS on, no public policies — service role only.

create table if not exists public.hkex_short_selling (
  id uuid primary key default gen_random_uuid(),
  ticker varchar(20) not null,
  as_of_date date not null,
  board varchar(8) not null,
  session varchar(20) not null,
  stock_name text,
  short_shares bigint not null,
  short_turnover_hkd numeric not null,
  source_url text not null,
  created_at timestamptz not null default now(),
  unique (ticker, as_of_date, session),
  constraint hkex_short_selling_board_chk check (board in ('MAIN', 'GEM')),
  constraint hkex_short_selling_session_chk check (session in ('DAY_CLOSE', 'MORNING_CLOSE')),
  constraint hkex_short_selling_shares_chk check (short_shares >= 0),
  constraint hkex_short_selling_turnover_chk check (short_turnover_hkd >= 0)
);

create index if not exists idx_hkex_short_selling_ticker_date
  on public.hkex_short_selling (ticker, as_of_date desc);

alter table public.hkex_short_selling enable row level security;
