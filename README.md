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
| `RESEARCH_INGEST_TOKEN` | Optional | Bearer token for `POST /api/ownership/ingest` (iMac CCASS script / agents) |

Hobby functions hard-timeout at **60 seconds**. IC uses four parallel DeepSeek calls plus a chair, then returns.

Investor writing style lives in `lib/llm/lenses.ts` — edit that file to change Buffett / Thiel / PE / Dalio. Concise vs Professional is chosen when you start a committee review.

### Public sources (no new paid API)

Headlines come from the **Yahoo Finance ticker RSS** (`feeds.finance.yahoo.com/...&s=TICKER`), not from Yahoo’s generic search feed (that feed is why older builds showed unrelated stories). Filings come from Yahoo `secFilings` (SEC EDGAR 10-K / 20-F / 6-K / 13G) plus constructed **HKEX** / **SEC** / **IR** links. Optional `FMP_API_KEY` adds extra ticker news. Chinese UI is a client dictionary + one `locale` flag on `/api/analyze` — no extra fonts or middleware, so first load stays fast.

Apply the SQL in `supabase/migrations/` to a Supabase project if you want financials cache, analysis snapshots, and ownership / CCASS rows. No extra Supabase settings beyond that.

HK CCASS and US 13F/Form 4 snapshots live in `ownership_snapshots`. The UI tab **籌碼與機構動向 / Smart Money Flow** reads `GET /api/ownership?ticker=…` and shows an empty state when nothing has been ingested. Running a committee review also writes a 3-bullet `smartMoneyInsight` from those snapshots. **股息與催化劑 / Dividends & Catalysts** uses `GET /api/catalysts` (Yahoo + headline search, DeepSeek synthesis, ticker-specific fallback). The iMac weekday job is `scripts/run_ownership_sync.sh` + `scripts/com.investmouse.ownership-sync.plist` (18:30 Mon–Fri). Default names are in `scripts/ownership_tickers.txt` (Hang Seng banks, internet/EV, US mega-cap). Override with `OWNERSHIP_TICKERS` in `.env.local`. HK names are scraped from the official [HKEX CCASS Shareholding Search](https://www3.hkexnews.hk/sdw/search/searchsdw.aspx); US names use Yahoo 13F / insider / short-interest modules.

## Scripts

- `npm run dev` — Next.js
- `npm test` — engine unit tests
- `npm run build` — production build
