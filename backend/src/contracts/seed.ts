/**
 * Fixed ids of the predefined plans. The API seeds them at every startup (idempotently) with these
 * ids, so clients can reference "Starter" or "Basic" without looking them up first.
 */
export const PREDEFINED_PLAN_IDS = {
  starter: '00000000-0000-4000-8000-000000000001',
  pro: '00000000-0000-4000-8000-000000000002',
  basic: '00000000-0000-4000-8000-000000000003',
  premium: '00000000-0000-4000-8000-000000000004',
} as const;
