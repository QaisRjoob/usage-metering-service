import { z } from 'zod';
import { monthSchema } from './common';

export const AI_QUESTION_MAX_LENGTH = 500;

export const aiAdvisorRequestSchema = z.object({
  question: z.string().trim().min(3, 'Ask a question of at least 3 characters').max(AI_QUESTION_MAX_LENGTH),
  month: monthSchema.optional(),
});
export type AiAdvisorRequest = z.infer<typeof aiAdvisorRequestSchema>;

export const AI_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AiSeverity = (typeof AI_SEVERITIES)[number];

/**
 * Structured answer produced by the AI provider. The server validates model output against this
 * schema before returning it; numbers in it come from server-side calculations.
 */
export const aiInsightSchema = z.object({
  summary: z.string().min(1).max(2000),
  highlights: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        detail: z.string().min(1).max(600),
        severity: z.enum(AI_SEVERITIES),
      }),
    )
    .max(8),
  recommendations: z.array(z.string().min(1).max(400)).max(6),
});
export type AiInsight = z.infer<typeof aiInsightSchema>;

export interface AiAdvisorScope {
  /** `account` when asked with an API key; `global` when asked with the admin token. */
  kind: 'account' | 'global';
  accountId: string | null;
  accountName: string | null;
  period: string;
  /** Number of aggregate rows given to the model as context. */
  dataPoints: number;
}

export interface AiAdvisorResponse {
  question: string;
  answer: AiInsight;
  scope: AiAdvisorScope;
  provider: 'mock' | 'openai';
  model: string | null;
  isMock: boolean;
  /** `partial` when the context had to be truncated or some data was unavailable. */
  dataCompleteness: 'complete' | 'partial';
  generatedAt: string;
}
