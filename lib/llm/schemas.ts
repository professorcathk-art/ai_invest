import { z } from "zod";

export const voteSchema = z.enum(["strong_invest", "conditional_invest", "pass"]);

export const personaNarrativeSchema = z.object({
  id: z.enum(["buffett", "thiel", "pe", "dalio"]),
  thesis: z.array(z.string()).min(2).max(4),
  risks: z.array(z.string()).min(1).max(3),
  argument: z.string(),
});

export const debateTurnSchema = z.object({
  speaker: z.enum(["buffett", "thiel", "pe", "dalio"]),
  text: z.string(),
});

export const icAnalysisSchema = z.object({
  narratives: z.array(personaNarrativeSchema).length(4),
  debate: z.array(debateTurnSchema).min(4).max(8),
  chairSummary: z.string(),
});

export type IcAnalysis = z.infer<typeof icAnalysisSchema>;
