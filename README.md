# PersonaVal

Multi-persona VC/PE valuation engine. Deterministic TypeScript DCF / LBO / VC models, DeepSeek IC personas, optional Supabase cache, and IB-formatted Excel export.

## Setup

```bash
cp .env.example .env.local
# optional: FMP_API_KEY, DEEPSEEK_API_KEY, Supabase keys
# cheapest completeness upgrade: FMP starter (~$15–20/mo) for statements + product/geo pies
npm install
npm run dev
```

The app does not serve demo or fixture books in the UI. If Yahoo / FMP return nothing usable, ticker load fails instead of inventing statements.

For HK names like `0005.HK`, add a **Financial Modeling Prep** key or the books stay incomplete (Yahoo often omits statements). The UI will not invent 0 / −100% scores until books are usable.

### Vercel environment (Production)

Set these in Vercel → Project → Settings → Environment Variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | Yes for IC | Platform key from DeepSeek |
| `DEEPSEEK_MODEL` | Recommended | Use `deepseek-v4-flash` (fast). `deepseek-v4-pro` often exceeds Hobby’s 60s limit |
| `FMP_API_KEY` | Recommended | Free signup (no card) at [FMP register](https://site.financialmodelingprep.com/register). Copy the key from the [dashboard](https://site.financialmodelingprep.com/developer/docs/dashboard). Needed for 5-year statements, product/geo pies, structured M&A. Starter (~$22/mo) unlocks HK + segments. |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | `https://uggnftvqtqiilxapysnt.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | JWT starting `eyJ…` role `anon` (not only `sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | JWT starting `eyJ…` role `service_role` |
| `RESEARCH_INGEST_TOKEN` | Optional | Bearer token for `POST /api/ownership/ingest` (iMac CCASS script / agents) |

Hobby functions hard-timeout at **60 seconds**. IC uses four parallel DeepSeek calls plus a chair, then returns.

Investor writing style lives in `lib/llm/lenses.ts` — edit that file to change Buffett / Thiel / PE / Dalio. Concise vs Professional is chosen when you start a committee review.

### Public sources (no new paid API)

Headlines come from **Yahoo Finance ticker RSS**, **Google News** (Reuters / MarketWatch site filters), plus sector tape from Reuters, CNBC, BBC Business, and SCMP. Filings come from Yahoo `secFilings` (SEC EDGAR 10-K / 20-F / 6-K / 13G) plus constructed **HKEX** / **SEC** / **IR** links. Optional `FMP_API_KEY` adds extra ticker news and product/geo pies. Chinese UI is a client dictionary + one `locale` flag on `/api/analyze` — no extra fonts or middleware, so first load stays fast.

**Cheap ways to make tabs look complete (do not invent figures):**

| Gap | Free / cheap source |
| --- | --- |
| 5-year statements, HK books, **一圖讀懂** pies | [FMP starter](https://site.financialmodelingprep.com/developer/docs) — best single paid key |
| Extra US headlines | [Finnhub](https://finnhub.io) free tier, or keep the new RSS mix |
| US 13F / Form 4 | Already live via Yahoo on IC / 機構動向 (`?refresh=1`). Official bulk: [SEC EDGAR](https://www.sec.gov/cgi-bin/browse-edgar) (free) |
| HK CCASS named brokers | Official [HKEX CCASS](https://www3.hkexnews.hk/sdw/search/searchsdw.aspx) via the weekday iMac job — no cheap third-party substitute |
| Private-market deals | FMP M&A if keyed; otherwise TechCrunch / Crunchbase / Reuters / Google News RSS |

Apply the SQL in `supabase/migrations/` to a Supabase project if you want financials cache, 72-hour IC memo cache (`cached_analyses`), analysis snapshots, and ownership / CCASS rows. No extra Supabase settings beyond that.

**IC memos restore without a second DeepSeek call.** After a review finishes, the memo is written to `cached_analyses` (72h) and `localStorage`. Searching another ticker and coming back hydrates the last memo for that name. Clicking **Run IC** again with the same sliders / personas / locale also hits the server cache (⚡ badge). Changing sliders or seats still spends tokens.

Top-nav also has **Top-Down 行業研報 / Sector Research** (`/industry-research`) and **私募與併購 / Private Market** (`/private-market`). Both pages stay blank when the public feed is empty — no invented sector commentary or fake Sequoia / a16z / KKR rows. The stock workbench **一圖讀懂公司業務 / Business Breakdown** tab uses FMP product / geographic segmentation when present; product cards still fill from the Yahoo description.

HK CCASS and US 13F/Form 4 snapshots live in `ownership_snapshots`. **Run IC always live-fetches Yahoo 13F / Form 4 / holders from the web.** If the database has no row (or no named HK CCASS), that live tape is shown on **籌碼與機構動向** immediately. Named HKEX CCASS brokers still win when the weekday iMac job has them; a same-day Yahoo row will not overwrite official CCASS. **股息與催化劑 / Dividends & Catalysts** uses `GET /api/catalysts` (Yahoo + headline search, DeepSeek synthesis). Missing live figures stay blank — no mock yields or invented event dates.

The weekday writer is the iMac job `scripts/run_ownership_sync.sh` + `scripts/com.investmouse.ownership-sync.plist` (18:30 Mon–Fri). Optional hourly RSS warmer: `scripts/sync_public_feeds.sh` + `scripts/com.investmouse.public-feeds.plist` (set `INVESTMOUSE_SITE_URL` to the Vercel URL). Default names are in `scripts/ownership_tickers.txt`: **Hang Seng Index (95) + Hang Seng TECH extras + 50 US mega-caps** (~155 names after de-dupe). A full HKEX pass needs the iMac awake for about 90 minutes. Override with `OWNERSHIP_TICKERS` in `.env.local`. HK names are scraped from the official [HKEX CCASS Shareholding Search](https://www3.hkexnews.hk/sdw/search/searchsdw.aspx); US names use Yahoo 13F / insider / short-interest modules.

**Agents (Workbuddy / Codex) may write sourced rows.** `GET /api/ownership/ingest` returns the JSON contract and valid examples. `POST` with `Authorization: Bearer $RESEARCH_INGEST_TOKEN`. A 400 includes `error`, `how_to_fix`, and the same `standard` so the agent can adjust. HK rows need named CCASS participants; US rows need Yahoo 13F / Form 4 fields. Unsourced writes are also blocked by a Postgres trigger.

## Scripts

- `npm run dev` — Next.js
- `npm test` — engine unit tests
- `npm run build` — production build
