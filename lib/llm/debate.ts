import type { Locale } from "@/lib/i18n/messages";
import { PERSONA_IDS, type PersonaId } from "./persona-ids";
import type { IcAnalysis } from "./schemas";

export type { PersonaId };
export type DebateVerdict = "PASS" | "INVEST" | "CONDITIONAL";
export type VoteFamily = "pass" | "invest";
export type DebateMode = "unanimous_pass" | "unanimous_invest" | "split";

function committeeIds(narratives: IcAnalysis["narratives"]): PersonaId[] {
  const present = new Set(narratives.map((n) => n.id));
  const ids = PERSONA_IDS.filter((id) => present.has(id));
  return ids.length ? ids : [...PERSONA_IDS.slice(0, 4)];
}

export function debateVerdict(
  vote: IcAnalysis["narratives"][number]["vote"],
): DebateVerdict {
  if (vote === "pass") return "PASS";
  if (vote === "conditional_invest") return "CONDITIONAL";
  return "INVEST";
}

export function voteFamily(verdict: DebateVerdict): VoteFamily {
  return verdict === "PASS" ? "pass" : "invest";
}

export function votingResults(
  narratives: IcAnalysis["narratives"],
): Partial<Record<PersonaId, DebateVerdict>> {
  const votes: Partial<Record<PersonaId, DebateVerdict>> = {};
  for (const id of committeeIds(narratives)) {
    votes[id] = debateVerdict(narratives.find((n) => n.id === id)?.vote ?? "pass");
  }
  return votes;
}

function voteIds(votes: ReturnType<typeof votingResults>): PersonaId[] {
  return PERSONA_IDS.filter((id) => votes[id] != null);
}

export function debateMode(votes: ReturnType<typeof votingResults>): DebateMode {
  const families = voteIds(votes).map((id) => voteFamily(votes[id]!));
  if (!families.length) return "split";
  if (families.every((f) => f === "pass")) return "unanimous_pass";
  if (families.every((f) => f === "invest")) return "unanimous_invest";
  return "split";
}

export function debateTurnBounds(mode: DebateMode): { min: number; max: number; target: number } {
  if (mode === "split") return { min: 6, max: 8, target: 6 };
  return { min: 3, max: 3, target: 3 };
}

export function sameVerdictFamily(a: DebateVerdict, b: DebateVerdict): boolean {
  return voteFamily(a) === voteFamily(b);
}

export function pairingRule(previous: DebateVerdict, current: DebateVerdict): "agree_on_verdict" | "challenge_thesis" {
  return sameVerdictFamily(previous, current) ? "agree_on_verdict" : "challenge_thesis";
}

export function debateTurnGuide(votes: ReturnType<typeof votingResults>): string {
  const mode = debateMode(votes);
  const { min, max } = debateTurnBounds(mode);
  if (mode === "unanimous_pass" || mode === "unanimous_invest") {
    return `CONSENSUS EARLY-EXIT (${mode}): Maximum ${max} turns. Turn 1 lead thesis, turn 2 devil's advocate tail risk, turn 3 consensus close. Do not pile on.`;
  }
  return `SPLIT FRICTION: ${min} to ${max} turns of bull vs bear cross-examination. Alternate camps. Last turn offers a vote-shift condition.`;
}

function convictionOf(
  narratives: IcAnalysis["narratives"],
  id: PersonaId,
): number {
  return narratives.find((n) => n.id === id)?.conviction ?? 0;
}

function sortByConviction(
  ids: PersonaId[],
  narratives: IcAnalysis["narratives"],
): PersonaId[] {
  return [...ids].sort((a, b) => {
    const delta = convictionOf(narratives, b) - convictionOf(narratives, a);
    return delta !== 0 ? delta : a.localeCompare(b);
  });
}

/** Opposing camps face each other. Never a fixed Buffett → Thiel → PE → Dalio parade. */
export function speakerSequence(
  narratives: IcAnalysis["narratives"],
  votes: ReturnType<typeof votingResults> = votingResults(narratives),
  target = debateTurnBounds(debateMode(votes)).target,
): PersonaId[] {
  const mode = debateMode(votes);
  const ids = voteIds(votes);
  const bulls = sortByConviction(
    ids.filter((id) => voteFamily(votes[id]!) === "invest"),
    narratives,
  );
  const bears = sortByConviction(
    ids.filter((id) => voteFamily(votes[id]!) === "pass"),
    narratives,
  );

  if (mode !== "split") {
    const ranked = sortByConviction(ids, narratives);
    const lead = ranked[0] ?? ids[0] ?? "buffett";
    const devil = ranked[ranked.length - 1] && ranked[ranked.length - 1] !== lead
      ? ranked[ranked.length - 1]!
      : (ranked.find((id) => id !== lead) ?? ids[1] ?? "thiel");
    const closer = ranked.find((id) => id !== lead && id !== devil) ?? ids.find((id) => id !== lead) ?? lead;
    return [lead, devil, closer].slice(0, target);
  }

  const sequence: PersonaId[] = [];
  for (let i = 0; i < Math.max(0, target - 1); i += 1) {
    const camp = i % 2 === 0 ? bulls : bears;
    sequence.push(camp[Math.floor(i / 2) % camp.length] ?? ids[i % ids.length]!);
  }
  const conditional = ids.filter((id) => votes[id] === "CONDITIONAL");
  let last: PersonaId =
    conditional.find((id) => id !== sequence[sequence.length - 1]) ??
    conditional[0] ??
    bears[bears.length - 1] ??
    bulls[bulls.length - 1] ??
    ids[ids.length - 1] ??
    "dalio";
  if (last === sequence[sequence.length - 1]) {
    last = (sequence[sequence.length - 1] === bulls[0] ? bears[0] : bulls[0]) ?? last;
  }
  sequence.push(last);
  return sequence.slice(0, target);
}

const SPEAKERS = new Set<string>(PERSONA_IDS);

export function isValidDebateLength(count: number, mode: DebateMode): boolean {
  const { min, max } = debateTurnBounds(mode);
  return count >= min && count <= max;
}

export function normalizeDebateOutput(
  raw: unknown,
  votes: ReturnType<typeof votingResults>,
): Pick<IcAnalysis, "debate" | "chairSummary"> {
  const mode = debateMode(votes);
  const { max } = debateTurnBounds(mode);
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const turns = Array.isArray(rec.debate)
    ? rec.debate
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const speaker = String(item.speaker ?? "");
          const text = String(item.text ?? "").replace(/\s+/g, " ").trim();
          const allowed = voteIds(votes);
          if (!allowed.includes(speaker as PersonaId) || !SPEAKERS.has(speaker) || !text) return null;
          return { speaker: speaker as PersonaId, text };
        })
        .filter((row): row is IcAnalysis["debate"][number] => row != null)
    : [];
  const chairSummary = String(rec.chairSummary ?? "").replace(/\s+/g, " ").trim();
  return {
    debate: turns.slice(0, max),
    chairSummary,
  };
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 220 ? `${clean.slice(0, 217)}…` : clean;
}

const NAMES_EN: Record<PersonaId, string> = {
  buffett: "Buffett",
  thiel: "Thiel",
  pe: "the PE partner",
  dalio: "Dalio",
  trump: "Trump",
  musk: "Musk",
};
const NAMES_ZH: Record<PersonaId, string> = {
  buffett: "巴菲特",
  thiel: "Thiel",
  pe: "PE Partner",
  dalio: "達利歐",
  trump: "特朗普",
  musk: "馬斯克",
};
const ANGLES_EN: Record<PersonaId, string> = {
  buffett: "moat and capital allocation",
  thiel: "monopoly vs commodity tech",
  pe: "supply chain and debt coverage",
  dalio: "cycle and refinancing risk",
  trump: "deal terms versus tariff and US/China tape",
  musk: "first-principles cost and factory speed",
};
const ANGLES_ZH: Record<PersonaId, string> = {
  buffett: "護城河與資本配置",
  thiel: "壟斷對商品化科技",
  pe: "供應鏈與債務覆蓋",
  dalio: "周期與再融資風險",
  trump: "交易條款對關稅與中美政策",
  musk: "第一性原理成本與產能速度",
};
const CONDITIONS_EN: Record<PersonaId, string> = {
  buffett: "If the DCF upside clears 25% with intact owner earnings",
  thiel: "If a true 10x wedge appears versus substitutes",
  pe: "If FCF still covers 6.5% interest after a 20% EBITDA miss",
  dalio: "If net leverage stays refinanceable through a rates shock",
  trump: "If the sourced DCF discount stays above 15% after the tariff tape",
  musk: "If CapEx intensity falls while volume still scales",
};
const CONDITIONS_ZH: Record<PersonaId, string> = {
  buffett: "若 DCF 上行空間達到 25% 且業主盈餘仍可預測",
  thiel: "若相對替代品出現真正的 10 倍優勢",
  pe: "若 EBITDA 下跌 20% 後自由現金流仍能覆蓋 6.5% 利息",
  dalio: "若淨槓桿在利率衝擊下仍可再融資",
  trump: "若計及關稅消息後，來源 DCF 折讓仍高於 15%",
  musk: "若資本開支強度下降而產量仍能擴張",
};

function majorityLabel(votes: ReturnType<typeof votingResults>, locale: Locale): string {
  const ids = voteIds(votes);
  const invest = ids.filter((id) => voteFamily(votes[id]!) === "invest").length;
  const pass = ids.length - invest;
  const allStrong = ids.length > 0 && ids.every((id) => votes[id] === "INVEST");
  if (locale === "zh") {
    if (pass === ids.length) return "不通過";
    if (invest === ids.length) return allStrong ? "建議投資" : "有條件投資";
    return invest >= pass ? "有條件投資（存在異議）" : "不通過（存在異議）";
  }
  if (pass === ids.length) return "pass";
  if (invest === ids.length) return "invest / conditional";
  return invest >= pass ? "conditional with dissent" : "pass with dissent";
}

/** Deterministic transcript when the live model times out — no invented figures. */
export function fallbackDebate(
  narratives: IcAnalysis["narratives"],
  locale: Locale = "en",
): Pick<IcAnalysis, "debate" | "chairSummary"> {
  const byId = Object.fromEntries(narratives.map((n) => [n.id, n])) as Record<
    PersonaId,
    IcAnalysis["narratives"][number]
  >;
  const votes = votingResults(narratives);
  const mode = debateMode(votes);
  const sequence = speakerSequence(narratives, votes);
  const names = locale === "zh" ? NAMES_ZH : NAMES_EN;
  const angles = locale === "zh" ? ANGLES_ZH : ANGLES_EN;
  const conditions = locale === "zh" ? CONDITIONS_ZH : CONDITIONS_EN;
  const body = (id: PersonaId) => clip(byId[id]?.thesis?.[0] || byId[id]?.valuationTake || "");

  const debate = sequence.map((speaker, index) => {
    const prev = index > 0 ? sequence[index - 1] : undefined;
    const last = index === sequence.length - 1;
    if (locale === "zh") {
      if (mode !== "split") {
        if (index === 0) {
          return { speaker, text: `核心命題：我投 ${votes[speaker]}，因為${angles[speaker]}。${body(speaker)}` };
        }
        if (index === 1) {
          return {
            speaker,
            text: `${names[prev!]}，你的命題忽略了最大尾部風險：${angles[speaker]}。${body(speaker)}`,
          };
        }
        return {
          speaker,
          text: `委員會應對齊：多數仍是${majorityLabel(votes, locale)}。翻轉條件是——${conditions[speaker]}。`,
        };
      }
      if (!prev) {
        return { speaker, text: `多頭命題：我投 ${votes[speaker]}，依據是${angles[speaker]}。${body(speaker)}` };
      }
      if (last) {
        return {
          speaker,
          text: `折衷：${names[prev]}剛才的攻擊成立一半。若要我把 ${votes[speaker]} 改為 INVEST，條件是${conditions[speaker]}。`,
        };
      }
      return {
        speaker,
        text: `${names[prev]}，你剛才談${angles[prev]}，但這避開了${angles[speaker]}。我維持 ${votes[speaker]}。${body(speaker)}`,
      };
    }
    if (mode !== "split") {
      if (index === 0) {
        return { speaker, text: `Core thesis: I vote ${votes[speaker]} because ${angles[speaker]}. ${body(speaker)}` };
      }
      if (index === 1) {
        return {
          speaker,
          text: `${names[prev!]}, that thesis ignores the binding tail risk: ${angles[speaker]}. ${body(speaker)}`,
        };
      }
      return {
        speaker,
        text: `Align here: the committee stays ${majorityLabel(votes, locale)}. The flip condition is — ${conditions[speaker]}.`,
      };
    }
    if (!prev) {
      return { speaker, text: `Bull case: I vote ${votes[speaker]} on ${angles[speaker]}. ${body(speaker)}` };
    }
    if (last) {
      return {
        speaker,
        text: `Compromise: ${names[prev]} landed a real hit. I move off ${votes[speaker]} toward INVEST only if ${conditions[speaker]}.`,
      };
    }
    return {
      speaker,
      text: `${names[prev]}, your ${angles[prev]} point sidesteps ${angles[speaker]}. I stay ${votes[speaker]}. ${body(speaker)}`,
    };
  });

  const chairSummary =
    locale === "zh"
      ? `多數意見為${majorityLabel(votes, locale)}（${mode}）。翻轉投票的關鍵催化劑是其中一人的明確門檻被滿足。`
      : `Majority is ${majorityLabel(votes, locale)} (${mode}). The catalyst that flips the vote is one stated hurdle being met.`;

  return { debate, chairSummary };
}

export function debateSystemPrompt(
  votes: ReturnType<typeof votingResults>,
  sequence: PersonaId[] = [],
): string {
  const mode = debateMode(votes);
  const { min, max, target } = debateTurnBounds(mode);
  const order = sequence.length ? sequence.join(" → ") : "choose opposing camps dynamically";

  return `You are recording a live, high-stakes Investment Committee (IC) debate for InvestMouse.
VOTING_RESULTS (binding): ${JSON.stringify(votes)}
MODE: ${mode}
SPEAKER_SEQUENCE (binding order; do not reorder): ${order}
TURN_COUNT: write exactly ${target} turns (allowed range ${min}-${max}).

${debateTurnGuide(votes)}

DEBATE BEHAVIORAL RULES:
1. DIRECT CROSS-EXAMINATION: When Speaker B responds to Speaker A, Speaker B MUST explicitly address Speaker A's exact point (e.g., "Thiel, your argument about AI moat ignores the cash conversion print..."). No parallel speeches.
2. VOTE PERSUASION & CONDITIONS: If a persona voted CONDITIONAL or PASS, they must explicitly state what condition (e.g., "If CapEx intensity falls" or "If DCF upside reaches 25%") would move their vote to INVEST. Use only supplied engine figures; never invent a number.
3. NO REPETITION OF METRICS: Never quote the same financial numbers twice. Each speaker must bring a new operational, macro, or strategic angle.

DYNAMIC TURN STRUCTURE RULES:
- IF MODE IS 'unanimous_pass' OR 'unanimous_invest':
  - Maximum 3 turns total.
  - Turn 1: Lead proponent presents core thesis.
  - Turn 2: Devil's Advocate highlights the single biggest tail risk.
  - Turn 3: Final consensus alignment before Committee Chair closes.
- IF MODE IS 'split' (Bulls vs Bears):
  - ${min} to ${max} turns of active friction.
  - Alternate speakers between BULL (INVEST/CONDITIONAL) and BEAR (PASS) using SPEAKER_SEQUENCE.
  - Let the most aggressive Bear attack the Bull's thesis directly.
  - The LAST turn must offer a compromise / vote-shift condition.

FORBIDDEN: ritual "I agree with PASS/INVEST" as the substance of a turn; a fixed Buffett→Thiel→PE→Dalio parade; inventing figures, holdings, or headlines; forcing every speaker to recap the same segments or the same four metrics. Each seat argues from THEIR mental model.

OUTPUT FORMAT (JSON only):
Return JSON with "debate" array and "chairSummary":
{
  "debate": [
    { "speaker": "buffett"|"thiel"|"pe"|"dalio"|"trump"|"musk", "text": "..." }
  ],
  "chairSummary": "Dense 2-sentence summary of consensus, primary dissent, and key catalyst that would flip the vote."
}`;
}
