import type { QuotaCheckRequest, QuotaCheckResult } from '@/models/consumption';
import type { QuotasOverview } from '@/models/quota';
import type { ListUsersParams } from '@/models/user';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

export type QuotasParams = Pick<ListUsersParams, 'page' | 'pageSize' | 'search' | 'status'>;

/** Account scope. */
export interface QuotaService {
  /** Current-month account quota plus a page of user quotas. */
  getQuotas(params: QuotasParams): Promise<QuotasOverview>;
  /** Dry run: evaluates both plans without consuming or recording anything. */
  checkQuota(request: QuotaCheckRequest): Promise<QuotaCheckResult>;
}

export function createHttpQuotaService(): QuotaService {
  return {
    getQuotas: (params) => apiRequest(endpoints.quotas.overview, { auth: 'account', query: { ...params } }),
    checkQuota: (request) => apiRequest(endpoints.quotas.check, { method: 'POST', auth: 'account', body: request }),
  };
}
