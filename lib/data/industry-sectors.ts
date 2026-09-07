export const INDUSTRY_SECTORS = [
  { id: "ai", tickers: ["NVDA", "AVGO", "AMD", "0981.HK"] },
  { id: "china-internet", tickers: ["0700.HK", "9988.HK", "3690.HK", "9618.HK"] },
  { id: "ev", tickers: ["TSLA", "1211.HK", "2015.HK"] },
  { id: "biotech", tickers: ["LLY", "2269.HK", "1801.HK"] },
  { id: "consumer", tickers: ["COST", "2020.HK", "9992.HK"] },
] as const;

export type IndustrySectorId = (typeof INDUSTRY_SECTORS)[number]["id"];

export type HeadlineImpact = "beneficiary" | "at_risk" | "watch";

export interface SectorHeadline {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
  ticker: string;
  impact: HeadlineImpact;
  lens: string;
}

export interface SectorResearch {
  sector: IndustrySectorId;
  headlines: SectorHeadline[];
  beneficiaries: string[];
  atRisk: string[];
}

const POSITIVE =
  /\b(beat|surge|soar|rally|win|approve|approval|record|raise|upgrade|order|tariff exemption|deal)\b|上調|獲批|創新高|大增/;
const NEGATIVE =
  /\b(miss|slash|ban|probe|fine|tariff|war|short|downgrade|cut guidance|recall|lawsuit|sanction)\b|下調|制裁|關稅|調查|罰款|禁令/;
const TRADE = /\b(trump|tariff|trade war|china|export control|sanction)\b|特朗普|關稅|貿易|出口管制|制裁/;

export function classifyHeadline(title: string, locale: "en" | "zh"): { impact: HeadlineImpact; lens: string } {
  const risk = NEGATIVE.test(title);
  const win = POSITIVE.test(title);
  const trade = TRADE.test(title);
  const impact: HeadlineImpact = risk && !win ? "at_risk" : win && !risk ? "beneficiary" : "watch";
  const lens = trade
    ? locale === "zh"
      ? "標題涉及貿易／關稅／地緣政策。交易視角：核對該公司的中美敞口，勿臆造評論。"
      : "Headline cites trade / tariff / geopolitical policy. Dealmaker lens: check US–China exposure. No invented commentary."
    : locale === "zh"
      ? "僅根據標題關鍵詞標示影響方向，並非投委會投票。"
      : "Impact tag is from headline keywords only — not an IC vote.";
  return { impact, lens };
}

export function isIndustrySectorId(value: string | null): value is IndustrySectorId {
  return INDUSTRY_SECTORS.some((s) => s.id === value);
}
