import OpenAI from 'openai';
import type { AIInsightInput, AIInsightResult, AIProvider } from '../../../Application/Modules/AI/Interfaces/AIProvider';
import { AppError } from '../../../Shared/Errors/AppError';
import { AI_INSIGHT_JSON_SCHEMA, USAGE_ADVISOR_INSTRUCTIONS, buildUserPrompt } from '../Prompts/usageAdvisorPrompt';

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  /**
   * An OpenAI-compatible API instead of OpenAI itself (e.g. OpenRouter,
   * https://openrouter.ai/api/v1). Such services are called through Chat Completions, which they
   * all implement; OpenAI itself is called through the Responses API.
   */
  baseURL?: string;
  /** Logs metadata only (model, token usage, duration) - never prompts or answers. */
  onUsage?: (metadata: { model: string; inputTokens?: number; outputTokens?: number; durationMs: number }) => void;
  /** For tests: a fetch implementation for the SDK. */
  fetch?: typeof fetch;
}

/**
 * Hosted provider using the official OpenAI SDK with a strict JSON schema, so every answer has the
 * same shape. One client is created at startup and reused. The SDK retries transient failures once.
 */
export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: options.timeoutMs,
      maxRetries: 1,
      fetch: options.fetch,
      // OpenRouter shows this name in its dashboard; other services ignore it.
      defaultHeaders: options.baseURL ? { 'X-Title': 'Usage Metering' } : undefined,
    });
  }

  /** Startup check that the configured model is available to this key (logged, not fatal). */
  async verifyModel(): Promise<boolean> {
    try {
      if (!this.options.baseURL) {
        await this.client.models.retrieve(this.options.model);
        return true;
      }
      // Compatible APIs do not all serve GET /models/{id}; the model list is universal.
      for await (const model of this.client.models.list()) if (model.id === this.options.model) return true;
      return false;
    } catch {
      return false;
    }
  }

  async generateUsageInsight(input: AIInsightInput): Promise<AIInsightResult> {
    const startedAt = Date.now();
    let outputText: string;
    try {
      const result = this.options.baseURL ? await this.viaChatCompletions(input) : await this.viaResponses(input);
      this.options.onUsage?.({ model: this.options.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, durationMs: Date.now() - startedAt });
      outputText = result.text;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('AI_PROVIDER_ERROR', providerErrorMessage(error));
    }

    try {
      // "openai" covers OpenAI and OpenAI-compatible APIs; the model name says which model answered.
      return { insight: JSON.parse(outputText), provider: 'openai', model: this.options.model };
    } catch {
      throw new AppError('AI_PROVIDER_ERROR', 'The AI provider returned an answer that is not valid JSON.');
    }
  }

  private async viaResponses(input: AIInsightInput): Promise<{ text: string; inputTokens?: number; outputTokens?: number }> {
    const response = await this.client.responses.create({
      model: this.options.model,
      instructions: USAGE_ADVISOR_INSTRUCTIONS,
      input: buildUserPrompt(input),
      max_output_tokens: this.options.maxOutputTokens,
      text: { format: { type: 'json_schema', name: 'usage_insight', schema: AI_INSIGHT_JSON_SCHEMA, strict: true } },
    });
    return { text: response.output_text, inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens };
  }

  private async viaChatCompletions(input: AIInsightInput): Promise<{ text: string; inputTokens?: number; outputTokens?: number }> {
    const completion = await this.client.chat.completions.create({
      model: this.options.model,
      messages: [
        { role: 'system', content: USAGE_ADVISOR_INSTRUCTIONS },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      max_tokens: this.options.maxOutputTokens,
      response_format: { type: 'json_schema', json_schema: { name: 'usage_insight', schema: AI_INSIGHT_JSON_SCHEMA, strict: true } },
    });
    const choice = completion.choices[0];
    if (choice?.finish_reason === 'length') {
      // Reasoning models spend part of the budget thinking; a cut-off answer is never valid JSON.
      throw new AppError('AI_PROVIDER_ERROR', 'The AI answer was cut off before it was complete. Raise AI_MAX_OUTPUT_TOKENS.');
    }
    const text = choice?.message?.content ?? '';
    // Some models wrap JSON in a Markdown fence despite the schema; unwrap it.
    const unwrapped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return { text: unwrapped, inputTokens: completion.usage?.prompt_tokens, outputTokens: completion.usage?.completion_tokens };
  }
}

/**
 * A short, client-safe reason for a provider failure. Provider details (raw messages, request ids)
 * are not forwarded; only the kind of problem, so the operator knows what to fix. OpenAI answers 429
 * both for real rate limits and for an account without credit (code insufficient_quota).
 */
export function providerErrorMessage(error: unknown): string {
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  const code = error instanceof OpenAI.APIError ? (error.code ?? error.type ?? '') : '';
  if (status === 429 && /insufficient_quota|credit/i.test(String(code))) {
    return 'The AI provider account has no credit left. Add credit on the provider platform, or set AI_PROVIDER=mock.';
  }
  if (status === 402) return 'The AI provider account has no credit left. Add credit on the provider platform, or set AI_PROVIDER=mock.';
  if (status === 429) return 'The AI provider is rate limiting requests. Try again later.';
  if (status === 401) return 'The AI provider rejected the API key. Check OPENAI_API_KEY.';
  return 'The AI provider failed to answer. Try again later.';
}
