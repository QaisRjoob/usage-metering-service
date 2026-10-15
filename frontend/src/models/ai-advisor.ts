export type { AiAdvisorRequest, AiAdvisorResponse, AiAdvisorScope, AiInsight, AiSeverity } from '@/contracts';
export { AI_QUESTION_MAX_LENGTH, aiAdvisorRequestSchema } from '@/contracts';

export const SUGGESTED_QUESTIONS: string[] = [
  'Which accounts are closest to exhausting their quotas?',
  'How has usage changed during the current month?',
  'Which accounts have experienced unusually high usage?',
  'Summarize current quota utilization.',
  'Which users are closest to their individual limits?',
  'Why were requests rejected this month?',
];
