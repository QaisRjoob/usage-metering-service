/** MOCK ADAPTER - implements QuotaService against the in-memory mock database. */
import { listUsersQuerySchema, quotaCheckRequestSchema } from '@/contracts';
import type { QuotaService } from '@/services/quotaService';
import { filteredUsers, pageOf, requireAccount, simulate, validate } from './mockRuntime';

export function createMockQuotaService(): QuotaService {
  return {
    getQuotas: (params) =>
      simulate((db) => {
        const account = requireAccount(db);
        const query = validate(listUsersQuerySchema, params);
        const period = db.currentPeriod();
        return {
          period,
          account: db.accountSnapshot(account, period),
          users: pageOf(filteredUsers(db, account.id, query, period), query),
        };
      }),

    checkQuota: (request) =>
      simulate((db) => {
        const account = requireAccount(db);
        return db.check(account, validate(quotaCheckRequestSchema, request));
      }),
  };
}
