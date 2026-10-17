import type { AIProvider } from '../../../Application/Modules/AI/Interfaces/AIProvider';
import type { AppConfig } from '../../../config/env';
import { MockAIProvider } from '../Providers/MockAIProvider';
import { OpenAIProvider, type OpenAIProviderOptions } from '../Providers/OpenAIProvider';

/** Selects the provider from AI_PROVIDER. The mock is explicit, never a silent fallback. */
export function createAIProvider(config: AppConfig, onUsage?: OpenAIProviderOptions['onUsage']): AIProvider {
  if (config.AI_PROVIDER === 'openai') {
    return new OpenAIProvider({
      apiKey: config.OPENAI_API_KEY!,
      model: config.OPENAI_MODEL!,
      baseURL: config.OPENAI_BASE_URL,
      timeoutMs: config.OPENAI_TIMEOUT_MS,
      maxOutputTokens: config.AI_MAX_OUTPUT_TOKENS,
      onUsage,
    });
  }
  return new MockAIProvider();
}
