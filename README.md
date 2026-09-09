# PersonaVal

Multi-persona VC/PE valuation engine. Deterministic TypeScript DCF / LBO / VC models, DeepSeek IC personas, optional Supabase cache, and IB-formatted Excel export.

## Setup

```bash
cp .env.example .env.local
# optional: FMP_API_KEY, DEEPSEEK_API_KEY, Supabase keys
# FMP_API_KEY: free key uses FMP *stable* API as Yahoo backup (US books, pies, M&A).
# HK statements / HK pies / FMP news / FMP 13F need a paid FMP plan.
npm install
npm run dev
```

The app does not serve demo or fixture books in the UI. If Yahoo / FMP return nothing usable, ticker load fails instead of inventing statements.

Yahoo is the primary quote and statement source. With `FMP_API_KEY`, FMP **fills zero / missing fields** (and US product/geo pies plus structured M&A). New FMP keys cannot call legacy `/api/v3` (403 after 31 Aug 2025); the app uses `https://financialmodelingprep.com/stable/...`. Hong Kong annual reports are still a **paid** FMP endpoint — those books stay on Yahoo + HKEX CCASS.

### Vercel environment (Production)

Set these in Vercel → Project → Settings → Environment Variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | Yes for IC | Platform key from DeepSeek |
| `DEEPSEEK_MODEL` | Recommended | Use `deepseek-v4-flash` (fast). `deepseek-v4-pro` often exceeds Hobby’s 60s limit |
| `FMP_API_KEY` | Recommended | Free signup at [FMP register](https://site.financialmodelingprep.com/register). Copy from the [dashboard](https://site.financialmodelingprep.com/developer/docs/dashboard) **and set the same key on Vercel**. Free tier: US statement backup, US pies, M&A, dividends. Paid starter unlocks HK books / HK pies. FMP news and 13F stay restricted on free keys — Yahoo RSS + live 13F / iMac CCASS cover those. |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | `https://uggnftvqtqiilxapysnt.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | JWT starting `eyJ…` role `anon` (not only `sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | JWT starting `eyJ…` role `service_role` |
| `RESEARCH_INGEST_TOKEN` | Optional | Bearer token for ownership, HKEX short-selling, sector-digest, and private-deal ingest jobs |

Hobby functions hard-timeout at **60 seconds**. IC uses four parallel DeepSeek calls plus a chair, then returns.

Investor writing style lives in `lib/llm/lenses.ts` — edit that file to change Buffett / Thiel / PE / Dalio. Concise vs Professional is chosen when you start a committee review.

### Public sources (no new paid API)

Headlines come from **Yahoo Finance ticker RSS**, **Google News** (Reuters / MarketWatch site filters), plus sector tape from Reuters, CNBC, BBC Business, and SCMP. Filings come from Yahoo `secFilings` (SEC EDGAR 10-K / 20-F / 6-K / 13G) plus constructed **HKEX** / **SEC** / **IR** links. Optional `FMP_API_KEY` fills missing US statement fields, US product/geo pies, dividend history, and structured M&A. Free keys cannot call FMP news or 13F; those stay Yahoo / CCASS. Chinese UI is a client dictionary + one `locale` flag on `/api/analyze` — no extra fonts or middleware, so first load stays fast.

**Cheap ways to make tabs look complete (do not invent figures):**

| Gap | Free / cheap source |
| --- | --- |
| 5-year US statements, US **一圖讀懂** pies, M&A | Free `FMP_API_KEY` (stable API). HK books / HK pies need [FMP starter](https://site.financialmodelingprep.com/developer/docs) |
| Extra US headlines | [Finnhub](https://finnhub.io) free tier, or keep the new RSS mix |
| US 13F / Form 4 | Already live via Yahoo on IC / 機構動向 (`?refresh=1`). Official bulk: [SEC EDGAR](https://www.sec.gov/cgi-bin/browse-edgar) (free) |
| HK CCASS named brokers | Official [HKEX CCASS](https://www3.hkexnews.hk/sdw/search/searchsdw.aspx) via the weekday iMac job — no cheap third-party substitute |
| HK short-selling turnover | Official [HKEX Short Selling Turnover Today](https://www.hkex.com.hk/eng/stat/smstat/ssturnover/sstoday.htm) (`ASHTMAIN` / `ASHTGEM` after the close) |
| Private-market deals | FMP M&A if keyed; otherwise TechCrunch / Crunchbase / Reuters / Google News RSS |

Apply the SQL in `supabase/migrations/` to a Supabase project if you want financials cache, 72-hour IC memo cache (`cached_analyses`), analysis snapshots, and ownership / CCASS rows. No extra Supabase settings beyond that.

**IC memos restore without a second DeepSeek call.** After a review finishes, the memo is written to `cached_analyses` (72h) and `localStorage`. Searching another ticker and coming back hydrates the last memo for that name. Clicking **Run IC** again with the same sliders / personas / locale also hits the server cache (⚡ badge). Changing sliders or seats still spends tokens.

Top-nav also has **Top-Down 行業研報 / Sector Research** (`/industry-research`) and **私募與併購 / Private Market** (`/private-market`). Sector research is a **rolling three-day digest**: sector and **general breaking** headlines stay even when they omit a ticker. English UI keeps English wires and an English desk note; 繁中 keeps Chinese wires and 書面語. Names are only attached when the title actually says them. The 06:15 HKT desk note infers which watchlist names are helped or hurt — that is not an IC vote. Private-market rows are AI-digested into **one company per deal**, with investment size and valuation filled only when the tape states them, plus public a16z / Y Combinator monitors. The page stays blank when the public feed is empty — no invented Sequoia / a16z / KKR rows. The stock workbench **一圖讀懂公司業務 / Business Breakdown** tab uses FMP product / geographic segmentation when present; product cards still fill from the Yahoo description.

HK CCASS and US 13F/Form 4 snapshots live in `ownership_snapshots`. **HKEX short-selling turnover** lives in `hkex_short_selling` (official `ASHTMAIN` / `ASHTGEM` after the close). That is daily short *turnover* in shares and HKD — not Yahoo’s US short interest % of float, and we do not label it as such. **Run IC always live-fetches Yahoo 13F / Form 4 / holders from the web.** If the database has no row (or no named HK CCASS), that live tape is shown on **籌碼與機構動向** immediately. Named HKEX CCASS brokers still win when the weekday iMac job has them; a same-day Yahoo row will not overwrite official CCASS. **股息與催化劑 / Dividends & Catalysts** uses `GET /api/catalysts` (Yahoo + headline search, DeepSeek synthesis). Missing live figures stay blank — no mock yields or invented event dates.

The iMac is on 24 hours, but **HKEX CCASS only publishes one file per trading day** (usually after the close, shown as T+1). Scraping hourly does not create new broker data. The Mac is used as several small jobs instead:

| Job | When (local) | What it writes |
| --- | --- | --- |
| `ccass-hk-1/2/3` | 19:00 / 19:05 / 19:10 Mon–Fri | 1/3 of the HK list each, in parallel, into `ownership_snapshots` |
| `hkex-shortsell` | 12:20, 16:25, 17:05 Mon–Fri | Official HKEX short-selling turnover into `hkex_short_selling` |
| `ccass-retry` | every 3 hours | Only names that failed earlier |
| `us-ownership` | 10:30, 16:30, 21:30 Mon–Fri | Yahoo 13F / Form 4 |
| `industry-digest` | 06:15 Mon–Fri | Writes yesterday’s sector digest (HKT) into `industry_digests` |
| `vc-pe` | 07:45 Mon–Fri | YC public launches + a16z announcement links into `private_deals` |
| `public-feeds` | hourly | Warms sector + private-market RSS |
| `warm-books` | 07:15 Mon–Fri | Caches a short ticker list into `financial_snapshots` |

Install once: `zsh scripts/install_imac_jobs.sh`. Logs live in `~/Library/Logs/investmouse-*.log`. Failed names are queued in `~/Library/Logs/investmouse-failed-tickers.txt`.

The weekday writer used to be a single 18:30 job; that label is disabled after install so it does not double-scrape. Default names are in `scripts/ownership_tickers.txt`: **Hang Seng Index (95) + Hang Seng TECH extras + 50 US mega-caps** (~155 names after de-dupe). A full HK pass is typically **~10 seconds per name** on HKEX’s page. Set `CCASS_LOOKBACK=1` if you also want a 21-day flow compare (extra POST per name). Override with `OWNERSHIP_TICKERS` in `.env.local`. HK names are scraped from the official [HKEX CCASS Shareholding Search](https://www3.hkexnews.hk/sdw/search/searchsdw.aspx); US names use Yahoo 13F / insider / short-interest modules.

**Agents (Workbuddy / Codex) may write sourced rows.** `GET /api/ownership/ingest` returns the JSON contract and valid examples. `POST` with `Authorization: Bearer $RESEARCH_INGEST_TOKEN`. A 400 includes `error`, `how_to_fix`, and the same `standard` so the agent can adjust. HK rows need named CCASS participants; US rows need Yahoo 13F / Form 4 fields. Unsourced writes are also blocked by a Postgres trigger.

## Scripts

- `npm run dev` — Next.js
- `npm test` — engine unit tests
- `npm run build` — production build
