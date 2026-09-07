export const PERSONA_IDS = ["buffett", "thiel", "pe", "dalio", "trump", "musk"] as const;

export type PersonaId = (typeof PERSONA_IDS)[number];

export const DEFAULT_PERSONA_IDS: PersonaId[] = ["buffett", "thiel", "pe", "dalio"];

export const MIN_SELECTED_PERSONAS = 2;
export const MAX_SELECTED_PERSONAS = 6;

const PERSONA_SET = new Set<string>(PERSONA_IDS);

export function isPersonaId(value: unknown): value is PersonaId {
  return typeof value === "string" && PERSONA_SET.has(value);
}

/** Preserve catalog order. Fall back to the original four if the payload is too thin. */
export function normalizeSelectedPersonas(raw: unknown): PersonaId[] {
  const picked = new Set<PersonaId>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isPersonaId(item)) picked.add(item);
    }
  }
  const selected = PERSONA_IDS.filter((id) => picked.has(id));
  if (selected.length < MIN_SELECTED_PERSONAS || selected.length > MAX_SELECTED_PERSONAS) {
    return [...DEFAULT_PERSONA_IDS];
  }
  return selected;
}

export function personasKey(ids: readonly PersonaId[]): string {
  return [...ids].sort().join(",");
}
