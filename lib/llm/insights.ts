import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { languageRule } from "./prompts";
import { smartMoneyInsightSchema, type SmartMoneyInsight } from "./schemas";
import {
  ownershipLlmBrief,
  pctDelta,
  sortChronological,
  type OwnershipSnapshot,
} from "@/lib/data/ownership";
import { parseCatalystEvent, type CatalystEvent, type DividendMetrics } from "@/lib/data/catalysts";
import type { NewsItem } from "@/lib/data/context";
import type { Locale } from "@/lib/i18n/messages";

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

function extractArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  const obj = extractJson(text);
  if (obj && typeof obj === "object" && Array.isArray((obj as { catalysts?: unknown }).catalysts)) {
    return (obj as { catalysts: unknown[] }).catalysts;
  }
  throw new Error("No JSON array in model output");
}

async function complete(system: string, prompt: string, maxOutputTokens: number): Promise<string> {
  const { text } = await generateText({
    model: deepseek(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"),
    system,
    prompt,
    maxRetries: 0,
    maxOutputTokens,
    temperature: 0.25,
    providerOptions: {
      deepseek: { thinking: { type: "disabled" } },
    },
  });
  return text;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}pp`;
}

export function fallbackSmartMoneyInsight(snapshots: OwnershipSnapshot[], locale: Locale): SmartMoneyInsight {
  const ordered = sortChronological(snapshots);
  const latest = ordered.at(-1);
  if (!latest) {
    return locale === "zh"
      ? {
          bullets: [
            "此股份尚未有已匯入的 CCASS 或 13F 快照，無法判斷近三十日機構與零售持股方向。",
            "經紀層面的增持或減持名單仍為空白，不宜把個別託管戶口解讀為主力動向。",
            "在平日同步任務寫入真實持股前，籌碼訊號應視為資料不足，而非中性或看多。",
          ],
        }
      : {
          bullets: [
            "No ingested CCASS or 13F snapshot exists yet, so the 30-day institutional versus retail shift cannot be scored.",
            "Broker-level accumulation and distribution lists are empty; individual custody names should not be treated as smart-money flow.",
            "Until the weekday ingest writes live holdings, the ownership signal is missing data — not a neutral or bullish reading.",
          ],
        };
  }

  const first = ordered[0]!;
  const instShift = pctDelta(first.institutional_pct ?? first.inst_holding_pct, latest.institutional_pct ?? latest.inst_holding_pct);
  const retailShift = pctDelta(first.retail_pct, latest.retail_pct);
  const buyer = latest.top_buyers[0]?.name;
  const seller = latest.top_sellers[0]?.name;
  const buyerChg = latest.top_buyers[0]?.change_30d;
  const sellerChg = latest.top_sellers[0]?.change_30d;

  if (locale === "zh") {
    return {
      bullets: [
        ordered.length < 2
          ? `最新快照顯示機構／託管 ${latest.institutional_pct ?? latest.inst_holding_pct ?? "—"}%，零售 ${latest.retail_pct ?? "—"}%，觀察日不足三十日，方向仍待下一筆數據確認。`
          : `近 ${ordered.length} 個觀察日，機構／託管持股變化 ${fmtPct(instShift)}，零售經紀變化 ${fmtPct(retailShift)}。`,
        buyer || seller
          ? `經紀流向方面，${buyer ? `${buyer} 錄得增持 ${buyerChg || "—"}` : "未見明確增持經紀"}；${seller ? `${seller} 錄得減持 ${sellerChg || "—"}` : "未見明確減持經紀"}。`
          : "此筆快照未提供經紀層面的增持或減持名單。",
        latest.signal_type === "INSTITUTIONAL_ACCUMULATION" || latest.signal_type === "INSIDER_BULLISH"
          ? "訊號偏向主力或內部人持續吸納，較接近長線底倉而非散戶炒作。"
          : latest.signal_type === "RETAIL_TRAP" || latest.signal_type === "INSIDER_SELLING"
            ? "訊號偏向機構或內部人派貨、零售承接，需防散戶接盤。"
            : "籌碼整體平穩，尚未構成明確的主力建倉或派貨結論。",
      ],
    };
  }

  return {
    bullets: [
      ordered.length < 2
        ? `Latest snapshot shows institutional / custody at ${latest.institutional_pct ?? latest.inst_holding_pct ?? "—"}% and retail at ${latest.retail_pct ?? "—"}%; the window is shorter than 30 days so direction still needs the next print.`
        : `Over ${ordered.length} observations, institutional / custody holdings moved ${fmtPct(instShift)} while retail brokers moved ${fmtPct(retailShift)}.`,
      buyer || seller
        ? `Notable flow: ${buyer ? `${buyer} accumulated ${buyerChg || "—"}` : "no clear accumulating broker"}; ${seller ? `${seller} distributed ${sellerChg || "—"}` : "no clear distributing broker"}.`
        : "This snapshot does not include broker-level accumulation or distribution names.",
      latest.signal_type === "INSTITUTIONAL_ACCUMULATION" || latest.signal_type === "INSIDER_BULLISH"
        ? "The signal reads as smart money or insiders building a longer-term floor rather than a retail squeeze."
        : latest.signal_type === "RETAIL_TRAP" || latest.signal_type === "INSIDER_SELLING"
          ? "The signal reads as institutional or insider distribution into retail demand — a retail-trap setup until proven otherwise."
          : "The float looks stable; it does not yet support a clean accumulation or distribution call.",
    ],
  };
}

export async function generateSmartMoneyInsight(
  snapshots: OwnershipSnapshot[],
  locale: Locale,
): Promise<SmartMoneyInsight> {
  if (!process.env.DEEPSEEK_API_KEY) return fallbackSmartMoneyInsight(snapshots, locale);
  const text = await complete(
    `You are the InvestMouse Smart Money desk.
HARD RULES:
- Use ONLY the supplied ownership JSON. Never invent percentages, broker names, or dates.
- Write exactly 3 bullets: (1) 30-day institutional vs retail / 13F shift, (2) notable broker or insider movements, (3) strategic implication.
- If snapshots are missing, say the data is insufficient. Do not invent a bullish or bearish call.
- ${languageRule(locale)}
Return ONLY JSON: { "bullets": ["...", "...", "..."] }`,
    ownershipLlmBrief(snapshots),
    500,
  );
  return smartMoneyInsightSchema.parse(extractJson(text));
}

export async function synthesizeCatalysts(input: {
  ticker: string;
  name: string;
  locale: Locale;
  news: NewsItem[];
  dividend: DividendMetrics;
  earningsDate: string | null;
}): Promise<CatalystEvent[]> {
  const allowedDates = new Set(
    [input.earningsDate, input.dividend.exDividendDate, ...input.news.map((n) => n.publishedAt?.slice(0, 10))]
      .filter((d): d is string => Boolean(d)),
  );
  const fromSources = (): CatalystEvent[] => {
    const fromNews = input.news
      .slice(0, 5)
      .map((item) =>
        parseCatalystEvent({
          type: /earnings|業績|results/i.test(item.title)
            ? "earnings"
            : /buyback|回購|dividend|派息/i.test(item.title)
              ? "buyback"
              : /sec|sfc|監管|probe/i.test(item.title)
                ? "regulatory"
                : "other",
          date: item.publishedAt,
          title: item.title,
          impact: /miss|cut|probe|fine|下滑|盈警/i.test(item.title)
            ? "bearish"
            : /buyback|beat|回購/i.test(item.title)
              ? "bullish"
              : "volatility",
        }),
      )
      .filter((row): row is CatalystEvent => row != null);
    if (input.earningsDate) {
      fromNews.unshift({
        type: "earnings",
        date: input.earningsDate,
        title:
          input.locale === "zh"
            ? `${input.name || input.ticker} 已排期的業績公布`
            : `${input.name || input.ticker} scheduled earnings release`,
        impact: "volatility",
      });
    }
    return fromNews.filter((row, i, arr) => arr.findIndex((other) => other.title === row.title) === i).slice(0, 5);
  };

  if (!process.env.DEEPSEEK_API_KEY) return fromSources();

  const headlines = input.news
    .map((n, i) => `${i + 1}. ${n.title}${n.publishedAt ? ` (${n.publishedAt.slice(0, 10)})` : ""}`)
    .join("\n");
  const text = await complete(
    `You synthesize a 3-5 event catalyst calendar for equity research.
HARD RULES:
- Use ONLY supplied headlines, the earnings date, and dividend facts. Do not invent filings, percentages, or dates.
- If a date is not in the supplied facts, set date to null. If nothing is known, return { "catalysts": [] }.
- Digest headlines into event titles; never paste a raw headline string unchanged.
- type must be earnings|buyback|product|regulatory|other.
- impact must be bullish|bearish|volatility.
- ${languageRule(input.locale)}
Return ONLY JSON: { "catalysts": [{ "type":"earnings","date":"YYYY-MM-DD"|null,"title":"...","impact":"volatility" }] }`,
    `Ticker: ${input.ticker} (${input.name})
Earnings date: ${input.earningsDate ?? "unknown"}
Ex-dividend: ${input.dividend.exDividendDate ?? "unknown"}
Dividend yield: ${input.dividend.yieldPct ?? "unknown"}
Annual DPS: ${input.dividend.annualDps ?? "unknown"}
Search headlines:
${headlines || "(none)"}`,
    700,
  );
  const rows = extractArray(text);
  const parsed = (Array.isArray(rows) ? rows : [])
    .map(parseCatalystEvent)
    .filter((row): row is CatalystEvent => row != null)
    .slice(0, 5);
  const grounded = parsed
    .map((row) => (row.date && !allowedDates.has(row.date) ? { ...row, date: null } : row))
    .slice(0, 5);
  return grounded.length > 0 ? grounded : fromSources();
}
