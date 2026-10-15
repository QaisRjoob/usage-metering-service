import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { AiAdvisorRequest } from '@/models/ai-advisor';
import { aiAdvisorRequestSchema } from '@/models/ai-advisor';
import { useCredentials } from '@/hooks/useCredentials';
import { useServices } from '@/providers/ServicesProvider';
import type { AiScope } from '@/services/aiAdvisorService';
import { currentUtcMonth } from '@/utils/dateUtils';
import { validateWith } from '@/utils/validationUtils';

/**
 * AI answers are personalised to the credential scope, so they are kept as mutation results and
 * not cached in the shared query cache.
 */
export function useAiAdvisorViewModel() {
  const services = useServices();
  const creds = useCredentials();
  const [question, setQuestion] = useState('');
  const [month, setMonth] = useState(currentUtcMonth());
  const [scope, setScope] = useState<AiScope>(creds.account ? 'account' : 'global');
  const [validationError, setValidationError] = useState<string | null>(null);

  const ask = useMutation({ mutationFn: (request: AiAdvisorRequest) => services.ai.ask(request, scope) });

  const submit = (text: string = question) => {
    const result = validateWith(aiAdvisorRequestSchema, { question: text, month });
    if (!result.success) return setValidationError(result.errors.question ?? 'Invalid question.');
    setValidationError(null);
    setQuestion(text);
    ask.mutate(result.data);
  };

  return {
    question,
    setQuestion,
    month,
    setMonth,
    scope,
    setScope: (next: AiScope) => {
      setScope(next);
      ask.reset();
    },
    canUseGlobal: Boolean(creds.adminToken),
    canUseAccount: Boolean(creds.account),
    accountName: creds.account?.accountName ?? null,
    validationError,
    submit,
    ask,
  };
}
