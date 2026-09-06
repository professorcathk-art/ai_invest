# Supabase (optional)

PersonaVal works without a database. When `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, Route Handlers use the service role to:

- cache `financial_snapshots` (24h TTL)
- persist `analyses` after IC runs
- store `ownership_snapshots` (HK CCASS + US 13F / Form 4 / short interest)

Apply `migrations/20260905120000_init_personaval.sql` in the Supabase SQL editor or via `supabase db push`. RLS is on with no public policies — do not query these tables from the browser.
