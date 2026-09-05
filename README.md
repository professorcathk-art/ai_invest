# PersonaVal

Multi-persona VC/PE valuation engine. Deterministic TypeScript DCF / LBO / VC models, DeepSeek IC personas, optional Supabase cache, and IB-formatted Excel export.

## Setup

```bash
cp .env.example .env.local
# optional: FMP_API_KEY, DEEPSEEK_API_KEY, Supabase keys
npm install
npm run dev
```

Without keys the app runs on bundled demo financials for `AAPL`, `NVDA`, and `0700.HK`.

For HK names like `0005.HK`, add a **Financial Modeling Prep** key or the books stay incomplete (Yahoo often omits statements). The UI will not invent 0 / −100% scores until books are usable.

### Vercel environment (Production)

Set these in Vercel → Project → Settings → Environment Variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | Yes for IC | Platform key from DeepSeek |
| `DEEPSEEK_MODEL` | Recommended | Use `deepseek-v4-flash` (fast). `deepseek-v4-pro` often exceeds Hobby’s 60s limit |
| `FMP_API_KEY` | Recommended | Real 5-year statements for most tickers |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | `https://uggnftvqtqiilxapysnt.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | JWT starting `eyJ…` role `anon` (not only `sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | JWT starting `eyJ…` role `service_role` |

Hobby functions hard-timeout at **60 seconds**. IC uses four parallel DeepSeek calls plus a chair, then returns.

Apply the SQL in `supabase/migrations/` to a Supabase project if you want financials cache and analysis snapshots. No extra Supabase settings beyond that.

## Scripts

- `npm run dev` — Next.js
- `npm test` — engine unit tests
- `npm run build` — production build
