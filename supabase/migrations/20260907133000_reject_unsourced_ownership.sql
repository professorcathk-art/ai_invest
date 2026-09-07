-- Block estimated / placeholder ownership writes at the database.
-- Service-role agents (Workbuddy, Codex) cannot bypass this trigger.

create or replace function public.ownership_snapshot_must_be_sourced()
returns trigger
language plpgsql
as $$
declare
  generic constant text := '^(insiders|retail brokers|index funds|institutions|smart money|custodians|corporate buyback)$';
  named_count int;
begin
  select count(*) into named_count
  from (
    select trim(e->>'name') as name
    from jsonb_array_elements(coalesce(new.top_buyers, '[]'::jsonb)) e
    union all
    select trim(e->>'name')
    from jsonb_array_elements(coalesce(new.top_sellers, '[]'::jsonb)) e
  ) p
  where p.name <> '' and p.name !~* generic;

  if new.market_type = 'HK' then
    if new.signal_type in ('INSIDER_BULLISH', 'INSIDER_SELLING') then
      raise exception 'Rejected: HK CCASS snapshots cannot use insider signals. Use INSTITUTIONAL_ACCUMULATION, RETAIL_TRAP, or NEUTRAL from real participant flow.'
        using errcode = 'check_violation';
    end if;
    if named_count = 0 then
      raise exception 'Rejected: HK snapshot has no real CCASS participant names. Estimated institutional/retail percentages without brokers (Citibank, HSBC, BOCHK, etc.) are not allowed. Scrape https://www3.hkexnews.hk/sdw/search/searchsdw.aspx or POST /api/ownership/ingest with named top_buyers/top_sellers.'
        using errcode = 'check_violation';
    end if;
  else
    if named_count = 0
       and new.inst_holding_pct is null
       and new.insider_holding_pct is null
       and new.short_interest_pct is null
       and new.net_insider_usd is null then
      raise exception 'Rejected: US snapshot needs 13F/Form 4 figures (inst_holding_pct, insider_holding_pct, short_interest_pct, or net_insider_usd) or named 13F holders. Estimated institutional_pct/retail_pct alone is not allowed.'
        using errcode = 'check_violation';
    end if;
    if new.signal_type in ('INSIDER_BULLISH', 'INSIDER_SELLING')
       and new.insider_holding_pct is null
       and new.net_insider_usd is null then
      raise exception 'Rejected: US insider signal requires insider_holding_pct or net_insider_usd from Form 4, not a guessed label.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ownership_snapshot_must_be_sourced on public.ownership_snapshots;
create trigger ownership_snapshot_must_be_sourced
before insert or update on public.ownership_snapshots
for each row
execute function public.ownership_snapshot_must_be_sourced();
