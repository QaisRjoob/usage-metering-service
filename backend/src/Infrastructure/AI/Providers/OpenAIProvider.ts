import OpenAI from 'openai';
import type { AIInsightInput, AIInsightResult, AIProvider } from '../../../Application/Modules/AI/Interfaces/AIProvider';
import { AppError } from '../../../Shared/Errors/AppError';
import { AI_INSIGHT_JSON_SCHEMA, USAGE_ADVISOR_INSTRUCTIONS, buildUserPrompt } from '../Prompts/usageAdvisorPrompt';

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  /** Logs metadata only (model, token usage, duration) - never prompts or answers. */
  onUsage?: (metadata: { model: string; inputTokens?: number; outputTokens?: number; durationMs: number }) => void;
}

/**
 * Hosted OpenAI provider using the official SDK and the Responses API with a strict JSON schema.
 * One client is created at startup and reused. The SDK retries transient failures once.
 */
export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIProviderOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey, timeout: options.timeoutMs, maxRetries: 1 });
  }

  /** Startup check that the configured model exists for this key (logged, not fatal). */
  async verifyModel(): Promise<boolean> {
    try {
      await this.client.models.retrieve(this.options.model);
      return true;
    } catch {
      return false;
    }
  }

  async generateUsageInsight(input: AIInsightInput): Promise<AIInsightResult> {
    const startedAt = Date.now();
    let outputText: string;
    try {
      const response = await this.client.responses.create({
        model: this.options.model,
        instructions: USAGE_ADVISOR_INSTRUCTIONS,
        input: buildUserPrompt(input),
        max_output_tokens: this.options.maxOutputTokens,
        text: { format: { type: 'json_schema', name: 'usage_insight', schema: AI_INSIGHT_JSON_SCHEMA, strict: true } },
      });
      this.options.onUsage?.({
        model: this.options.model,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        durationMs: Date.now() - startedAt,
      });
      outputText = response.output_text;
    } catch (error) {
      // Provider details (status, message) are not forwarded to clients.
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      throw new AppError('AI_PROVIDER_ERROR', status === 429 ? 'The AI provider is rate limiting requests. Try again later.' : 'The AI provider failed to answer. Try again later.');
    }

    try {
      return { insight: JSON.parse(outputText), provider: 'openai', model: this.options.model };
    } catch {
      throw new AppError('AI_PROVIDER_ERROR', 'The AI provider returned an answer that is not valid JSON.');
    }
  }
}
