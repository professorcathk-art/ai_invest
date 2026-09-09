-- Post-money valuation copied from sourced headlines. Empty when the tape does not state it.

alter table public.private_deals
  add column if not exists valuation text not null default '';
