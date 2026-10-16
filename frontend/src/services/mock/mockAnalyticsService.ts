/** MOCK ADAPTER - implements AnalyticsService against the in-memory mock database. */
import { monthSchema } from '@/contracts';
import type { AnalyticsService } from '@/services/analyticsService';
import { requireAdmin, simulate, validate } from './mockRuntime';

export function createMockAnalyticsService(): AnalyticsService {
  return {
    getAdminSummary: (month) =>
      simulate((db) => {
        requireAdmin();
        return db.adminSummary(validate(monthSchema, month));
      }),
  };
}
