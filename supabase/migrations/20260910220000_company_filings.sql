-- Official annual reports / 10-Ks cached from the iMac job.
-- PDFs live in the public company-filings bucket; this table is the index + excerpt.
-- RLS on, no public policies — service role only. Public object URLs still work
-- because the bucket is public (no SELECT policy, so the bucket is not listable).

create table if not exists public.company_filings (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  fiscal_year int not null,
  doc_type text not null,
  title text not null default '',
  source_url text not null default '',
  storage_path text not null default '',
  public_url text not null default '',
  excerpt text not null default '',
  bytes int not null default 0,
  fetched_at timestamptz not null default now(),
  unique (ticker, fiscal_year, doc_type)
);

create index if not exists idx_company_filings_ticker_year
  on public.company_filings (ticker, fiscal_year desc);

alter table public.company_filings enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-filings',
  'company-filings',
  true,
  52428800,
  array['application/pdf', 'text/html', 'application/xhtml+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
