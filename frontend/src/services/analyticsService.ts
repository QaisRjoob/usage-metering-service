import type { AdminAnalyticsSummary } from '@/models/usage-summary';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

/** Operator scope: dashboard metrics across all accounts. */
export interface AnalyticsService {
  getAdminSummary(month: string): Promise<AdminAnalyticsSummary>;
}

export function createHttpAnalyticsService(): AnalyticsService {
  return {
    getAdminSummary: (month) => apiRequest(endpoints.admin.analyticsSummary, { auth: 'admin', query: { month } }),
  };
}
