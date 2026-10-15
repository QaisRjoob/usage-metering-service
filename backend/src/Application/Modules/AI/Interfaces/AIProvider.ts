import type { AiAdvisorScope, AiInsight } from '../../../../contracts';

/** Pre-computed, bounded, privacy-reduced aggregates. The model explains them; it never computes them. */
export interface AIInsightInput {
  question: string;
  scope: AiAdvisorScope;
  /** JSON-serializable aggregates computed by the service. */
  context: Record<string, unknown>;
}

export interface AIInsightResult {
  insight: AiInsight;
  provider: 'mock' | 'openai';
  model: string | null;
}

/** Implemented in Infrastructure (OpenAI or mock). Application code never imports the OpenAI SDK. */
export interface AIProvider {
  generateUsageInsight(input: AIInsightInput): Promise<AIInsightResult>;
}
