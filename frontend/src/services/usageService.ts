import type { ConsumeDecision, ConsumeRequest } from '@/models/consumption';
import type { PaginatedResponse } from '@/models/pagination';
import type { AdminListUsageParams, ListUsageParams, UsageRecord } from '@/models/usage-record';
import type { AccountUsageSummary } from '@/models/usage-summary';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

export interface UsageService {
  /** Account scope: request history (accepted and rejected), newest first. */
  getUsageHistory(params: ListUsageParams): Promise<PaginatedResponse<UsageRecord>>;
  /** Operator scope: history across accounts. */
  getAdminUsageHistory(params: AdminListUsageParams): Promise<PaginatedResponse<UsageRecord>>;
  /** Account scope: one record. */
  getUsageRecord(usageId: string): Promise<UsageRecord>;
  /** Account scope: usage summary for a UTC month. */
  getUsageSummary(month?: string): Promise<AccountUsageSummary>;
  /** Account scope: consumes units if both plans allow it. Safe to retry with the same requestId. */
  consume(request: ConsumeRequest): Promise<ConsumeDecision>;
}

export function createHttpUsageService(): UsageService {
  return {
    getUsageHistory: (params) => apiRequest(endpoints.usage.list, { auth: 'account', query: { ...params } }),
    getAdminUsageHistory: (params) => apiRequest(endpoints.admin.usage, { auth: 'admin', query: { ...params } }),
    getUsageRecord: (usageId) => apiRequest(endpoints.usage.detail(usageId), { auth: 'account' }),
    getUsageSummary: (month) => apiRequest(endpoints.account.usageSummary, { auth: 'account', query: { month } }),
    consume: (request) => apiRequest(endpoints.usage.consume, { method: 'POST', auth: 'account', body: request }),
  };
}
