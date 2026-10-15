import type { AiAdvisorRequest, AiAdvisorResponse } from '@/models/ai-advisor';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

/**
 * `account` sends the connected API key (answers cover that account only);
 * `global` sends the admin token (answers may cover all accounts).
 */
export type AiScope = 'account' | 'global';

export interface AiAdvisorService {
  ask(request: AiAdvisorRequest, scope: AiScope): Promise<AiAdvisorResponse>;
}

export function createHttpAiAdvisorService(): AiAdvisorService {
  return {
    ask: (request, scope) =>
      apiRequest(endpoints.ai.advisor, {
        method: 'POST',
        auth: scope === 'global' ? 'admin' : 'account',
        body: request,
        timeoutMs: 45_000,
      }),
  };
}
