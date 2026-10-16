/** MOCK ADAPTER - implements AccountService against the in-memory mock database. */
import { ERROR_CODES, createAccountSchema, listAccountsQuerySchema, listUsersQuerySchema } from '@/contracts';
import type { AccountService } from '@/services/accountService';
import type { CurrentAccountResponse } from '@/models/account';
import type { MockDatabase, AccountRow } from './mockDatabase';
import { PREDEFINED_PLAN_IDS } from './mockSeed';
import { filteredUsers, notFound, pageOf, requireAccount, requireAdmin, simulate, unprocessable, validate } from './mockRuntime';

function currentAccount(db: MockDatabase, account: AccountRow): CurrentAccountResponse {
  const plan = db.plans.get(account.planId)!;
  return {
    account: { id: account.id, name: account.name, apiKeyPrefix: account.apiKeyPrefix, createdAt: account.createdAt },
    plan: db.planDto(plan),
    quota: db.accountSnapshot(account, db.currentPeriod()),
  };
}

export function createMockAccountService(): AccountService {
  return {
    listAccounts: (params) =>
      simulate((db) => {
        requireAdmin();
        const query = validate(listAccountsQuerySchema, params);
        const period = query.month ?? db.currentPeriod();
        const search = query.search?.toLowerCase();
        const direction = query.order === 'asc' ? 1 : -1;
        const items = [...db.accounts.values()]
          .filter((account) => !search || account.name.toLowerCase().includes(search) || account.id.includes(search))
          .map((account) => db.accountListItem(account, period))
          .filter((account) => !query.status || account.quota.status === query.status)
          .filter((account) => !query.planId || account.quota.planId === query.planId)
          .filter((account) => !query.planKind || (query.planKind === 'predefined') === Boolean(db.plans.get(account.quota.planId)?.isPredefined))
          .filter((account) => query.minUtilization === undefined || account.quota.utilizationPercent >= query.minUtilization)
          .filter((account) => query.maxUtilization === undefined || account.quota.utilizationPercent <= query.maxUtilization)
          .filter((account) => !query.createdFrom || account.createdAt.slice(0, 10) >= query.createdFrom)
          .filter((account) => !query.createdTo || account.createdAt.slice(0, 10) <= query.createdTo)
          .sort((a, b) => {
            const primary =
              query.sort === 'name'
                ? a.name.localeCompare(b.name)
                : query.sort === 'utilization'
                  ? a.quota.utilizationPercent - b.quota.utilizationPercent
                  : query.sort === 'consumed'
                    ? a.quota.consumed - b.quota.consumed
                    : query.sort === 'userCount'
                      ? a.userCount - b.userCount
                      : a.createdAt.localeCompare(b.createdAt);
            return (primary || a.id.localeCompare(b.id)) * direction;
          });
        return pageOf(items, query);
      }),

    getAccount: (accountId, month) =>
      simulate((db) => {
        requireAdmin();
        return db.accountDetails(db.getAccount(accountId), month ?? db.currentPeriod());
      }),

    listAccountUsers: (accountId, params) =>
      simulate((db) => {
        requireAdmin();
        const account = db.getAccount(accountId);
        const query = validate(listUsersQuerySchema, params);
        return pageOf(filteredUsers(db, account.id, query, query.month ?? db.currentPeriod()), query);
      }),

    createAccount: (request) =>
      simulate((db) => {
        requireAdmin();
        const input = validate(createAccountSchema, request);
        const planId = input.planId ?? PREDEFINED_PLAN_IDS.starter;
        const plan = db.plans.get(planId);
        if (!plan || !plan.isPredefined) throw notFound(ERROR_CODES.PLAN_NOT_FOUND, 'New accounts can start on a predefined account plan only.');
        if (plan.scope !== 'account') throw unprocessable(ERROR_CODES.PLAN_SCOPE_MISMATCH, 'A user plan cannot be assigned to an account.');
        const { row, apiKey } = db.createAccount({ name: input.name, planId });
        return { account: db.accountListItem(row, db.currentPeriod()), apiKey };
      }),

    getCurrentAccount: () => simulate((db) => currentAccount(db, requireAccount(db))),

    verifyApiKey: (apiKey) => simulate((db) => currentAccount(db, requireAccount(db, apiKey))),

    assignAccountPlan: (planId) =>
      simulate((db) => {
        const account = requireAccount(db);
        const plan = db.visiblePlan(planId, account.id);
        if (plan.scope !== 'account') throw unprocessable(ERROR_CODES.PLAN_SCOPE_MISMATCH, 'A user plan cannot be assigned to an account.');
        account.planId = plan.id;
        return currentAccount(db, account);
      }),
  };
}
