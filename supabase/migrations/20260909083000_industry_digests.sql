-- Daily sector news digests. RLS on, no public policies — service role only.

create table if not exists public.industry_digests (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null,
  sector varchar(32) not null,
  locale varchar(8) not null,
  headlines jsonb not null default '[]'::jsonb,
  beneficiaries jsonb not null default '[]'::jsonb,
  at_risk jsonb not null default '[]'::jsonb,
  brief jsonb not null default '[]'::jsonb,
  source varchar(40) not null default 'rss',
  created_at timestamptz not null default now(),
  unique (as_of_date, sector, locale)
);

create index if not exists idx_industry_digests_date
  on public.industry_digests (as_of_date desc, sector, locale);

alter table public.industry_digests enable row level security;
