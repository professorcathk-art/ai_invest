import { z } from "zod";

export const voteSchema = z.enum(["strong_invest", "conditional_invest", "pass"]);

export const personaIdSchema = z.enum(["buffett", "thiel", "pe", "dalio", "expert", "trump", "musk"]);

export const personaNarrativeSchema = z.object({
  id: personaIdSchema,
  vote: voteSchema,
  conviction: z.number().min(0).max(100),
  thesis: z.array(z.string()).min(3).max(5),
  valuationTake: z.string(),
  argument: z.string(),
  catalysts: z.array(z.string()).min(2).max(4),
  risks: z.array(z.string()).min(2).max(4),
});

export const debateTurnSchema = z.object({
  speaker: personaIdSchema,
  text: z.string(),
});

export const smartMoneyInsightSchema = z.object({
  bullets: z.array(z.string().min(1)).min(3).max(3),
});

export const icAnalysisSchema = z.object({
  narratives: z.array(personaNarrativeSchema).min(2).max(7),
  debate: z.array(debateTurnSchema).min(3).max(8),
  chairSummary: z.string(),
  smartMoneyInsight: smartMoneyInsightSchema.optional(),
});

export type SmartMoneyInsight = z.infer<typeof smartMoneyInsightSchema>;

export type IcAnalysis = z.infer<typeof icAnalysisSchema>;
