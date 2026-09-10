import { MENTAL_MODEL_FILTERS, PERSONA_DISPLAY_NAMES } from "@/lib/investor-knowledge-base";

/** Short filter cards. Full wisdom + quotes live in personaSystemPrompt. */
export const PERSONA_LENSES = {
  buffett: `${PERSONA_DISPLAY_NAMES.buffett}\n${MENTAL_MODEL_FILTERS.buffett}`,
  thiel: `${PERSONA_DISPLAY_NAMES.thiel}\n${MENTAL_MODEL_FILTERS.thiel}`,
  pe: `${PERSONA_DISPLAY_NAMES.pe}\n${MENTAL_MODEL_FILTERS.pe}`,
  dalio: `${PERSONA_DISPLAY_NAMES.dalio}\n${MENTAL_MODEL_FILTERS.dalio}`,
  trump: `${PERSONA_DISPLAY_NAMES.trump}\n${MENTAL_MODEL_FILTERS.trump}`,
  musk: `${PERSONA_DISPLAY_NAMES.musk}\n${MENTAL_MODEL_FILTERS.musk}`,
  expert: `${PERSONA_DISPLAY_NAMES.expert}\n${MENTAL_MODEL_FILTERS.expert}`,
} as const;
