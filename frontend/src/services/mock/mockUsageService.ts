/** MOCK ADAPTER - implements UsageService against the in-memory mock database. */
import { ERROR_CODES, adminListUsageQuerySchema, consumeRequestSchema, listUsageQuerySchema, monthSchema } from '@/contracts';
import type { UsageService } from '@/services/usageService';
import { notFound, requireAccount, requireAdmin, simulate, validate } from './mockRuntime';

export function createMockUsageService(): UsageService {
  return {
    getUsageHistory: (params) =>
      simulate((db) => {
        const account = requireAccount(db);
        const query = validate(listUsageQuerySchema, params);
        return db.listUsage(
          { accountId: account.id, externalUserId: query.userId, outcome: query.outcome, month: query.month, from: query.from, to: query.to },
          query.page,
          query.pageSize,
        );
      }),

    getAdminUsageHistory: (params) =>
      simulate((db) => {
        requireAdmin();
        const query = validate(adminListUsageQuerySchema, params);
        return db.listUsage(
          { accountId: query.accountId, externalUserId: query.userId, outcome: query.outcome, month: query.month, from: query.from, to: query.to },
          query.page,
          query.pageSize,
        );
      }),

    getUsageRecord: (usageId) =>
      simulate((db) => {
        const account = requireAccount(db);
        const row = db.requests.find((candidate) => candidate.id === usageId && candidate.accountId === account.id);
        if (!row) throw notFound(ERROR_CODES.USAGE_RECORD_NOT_FOUND, 'Usage record not found.');
        return db.usageRecordDto(row);
      }),

    getUsageSummary: (month) =>
      simulate((db) => {
        const account = requireAccount(db);
        const period = month === undefined ? db.currentPeriod() : validate(monthSchema, month);
        return db.accountUsageSummary(account, period);
      }),

    consume: (request) =>
      simulate((db) => {
        const account = requireAccount(db);
        return db.consume(account, validate(consumeRequestSchema, request));
      }),
  };
}
