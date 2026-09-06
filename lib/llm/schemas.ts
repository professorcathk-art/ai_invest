import { z } from "zod";

export const voteSchema = z.enum(["strong_invest", "conditional_invest", "pass"]);

export const personaNarrativeSchema = z.object({
  id: z.enum(["buffett", "thiel", "pe", "dalio"]),
  vote: voteSchema,
  conviction: z.number().min(0).max(100),
  thesis: z.array(z.string()).min(3).max(5),
  valuationTake: z.string(),
  argument: z.string(),
  catalysts: z.array(z.string()).min(2).max(4),
  risks: z.array(z.string()).min(2).max(4),
});

export const debateTurnSchema = z.object({
  speaker: z.enum(["buffett", "thiel", "pe", "dalio"]),
  text: z.string(),
});

export const icAnalysisSchema = z.object({
  narratives: z.array(personaNarrativeSchema).length(4),
  debate: z.array(debateTurnSchema).min(6).max(8),
  chairSummary: z.string(),
});

export type IcAnalysis = z.infer<typeof icAnalysisSchema>;
