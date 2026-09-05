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

Apply the SQL in `supabase/migrations/` to a Supabase project if you want financials cache and analysis snapshots.

## Scripts

- `npm run dev` — Next.js
- `npm test` — engine unit tests
- `npm run build` — production build
