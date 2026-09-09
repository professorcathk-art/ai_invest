-- Digested private-market / M&A rows. RLS on, no public policies — service role only.

create table if not exists public.private_deals (
  id uuid primary key default gen_random_uuid(),
  deal_key text not null unique,
  announced_on date,
  target text not null,
  acquirer text not null default '',
  sector text not null default '',
  deal_type text not null default '',
  deal_size text not null default '',
  lead_investors text not null default '',
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_private_deals_announced
  on public.private_deals (announced_on desc);

alter table public.private_deals enable row level security;
