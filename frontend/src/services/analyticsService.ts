import type { AdminAnalyticsSummary } from '@/models/usage-summary';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

/** Operator scope: dashboard metrics across all accounts. */
export interface AnalyticsService {
  getAdminSummary(month: string): Promise<AdminAnalyticsSummary>;
  /** Checks a token with a cheap admin call before it is stored. */
  verifyAdminToken(token: string): Promise<void>;
}

export function createHttpAnalyticsService(): AnalyticsService {
  return {
    getAdminSummary: (month) => apiRequest(endpoints.admin.analyticsSummary, { auth: 'admin', query: { month } }),
    verifyAdminToken: async (token) => {
      await apiRequest(endpoints.admin.accounts, { auth: { adminToken: token }, query: { page: 1, pageSize: 1 } });
    },
  };
}
