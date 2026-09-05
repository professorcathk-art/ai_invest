# Product Requirements Document (PRD)

## Project Name: PersonaVal – Multi-Persona VC/PE Valuation & Analysis Engine

### Mission

Web-based financial intelligence platform for VC/PE professionals and recruiters. Fetches ticker data, executes deterministic DCF / LBO / VC engines, and overlays LLM-driven Investment Committee personas (Buffett, Thiel, PE Partner, Dalio).

### Invariant

Calculations (DCF, LBO, Sensitivity, ratios) are computed in TypeScript engines. The LLM interprets engine outputs only — it never invents numbers.

### Stack

- Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Recharts
- Data: Financial Modeling Prep (primary), Yahoo Finance (fallback), demo fixtures
- LLM: DeepSeek via Vercel AI SDK (`DEEPSEEK_API_KEY`)
- Persistence: Supabase (financials cache + analysis snapshots)
- Excel: exceljs with native formulas and IB formatting

### Engines

- **DCF**: UFCF = EBIT × (1 − t) + D&A − CapEx − ΔNWC; WACC via CAPM; Gordon + exit-multiple TV; 5×5 sensitivity
- **LBO**: 20–80% debt, 6.5% interest, 5% annual paydown; MoIC and 5-year IRR; base / bull / bear
- **VC**: YoY, 3-yr CAGR, Rule of 40, FCF margin, capital efficiency, EV/Revenue

### Personas

| Persona | Thresholds |
| --- | --- |
| Warren Buffett | ROIC > 15%, positive FCF 5 yrs, low D/E |
| Peter Thiel | YoY > 40%, gross margin > 70% |
| PE Partner | EBITDA margin > 20%, FCF conversion > 60%, IRR > 20%, MoIC > 2.5x |
| Ray Dalio | Strong BS, low net debt/EBITDA |

Votes: `Strong Invest` | `Conditional Invest` | `Pass`

### UI

Dark Bloomberg × Linear. Canvas `#0B0F17`, cards `#111827`, emerald / blue / amber / crimson accents. Inter + JetBrains Mono. Sliders update engines without reload. Tabs: Persona Matrix, Valuation Workbench, IC Debate Room. Excel export button.
