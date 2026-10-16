/** MOCK ADAPTER - implements DirectoryService against the in-memory mock database. */
import { QUOTA_STATUSES, accountFacetsQuerySchema, adminListUsersQuerySchema, adminSearchQuerySchema, userFacetsQuerySchema, type QuotaStatus } from '@/contracts';
import type { AccountFacets, AdminUserListItem, PlanFacet } from '@/models/directory';
import type { DirectoryService } from '@/services/directoryService';
import type { AccountRow, MockDatabase, UserRow } from './mockDatabase';
import { pageOf, requireAdmin, simulate, validate } from './mockRuntime';

/** Same rule as the API: name, id, API key prefix, or one of the account's users. */
export function accountMatches(db: MockDatabase, account: AccountRow, search: string): boolean {
  const text = search.toLowerCase();
  return (
    account.name.toLowerCase().includes(text) ||
    account.id.includes(text) ||
    account.apiKeyPrefix.toLowerCase().includes(text) ||
    db.accountUsers(account.id).some((user) => userMatches(user, text))
  );
}

function userMatches(user: UserRow, search: string): boolean {
  const text = search.toLowerCase();
  return user.externalUserId.toLowerCase().includes(text) || (user.displayName ?? '').toLowerCase().includes(text) || user.id.includes(text);
}

/** Missing values go last in both directions, like SQL "NULLS LAST". */
export function compareNullsLast(a: string | null, b: string | null, direction: 1 | -1): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b) * direction;
}

function facetsOf(db: MockDatabase, items: { status: QuotaStatus; planId: string; active: boolean }[], period: string): AccountFacets {
  const byStatus = Object.fromEntries(QUOTA_STATUSES.map((status) => [status, 0])) as Record<QuotaStatus, number>;
  const plans = new Map<string, PlanFacet>();
  let active = 0;
  for (const item of items) {
    byStatus[item.status] += 1;
    if (item.active) active += 1;
    const plan = db.plans.get(item.planId)!;
    const facet = plans.get(plan.id) ?? {
      planId: plan.id,
      planName: plan.name,
      isPredefined: plan.isPredefined,
      ownerAccountName: plan.ownerAccountId ? (db.accounts.get(plan.ownerAccountId)?.name ?? null) : null,
      count: 0,
    };
    facet.count += 1;
    plans.set(plan.id, facet);
  }
  const byPlan = [...plans.values()].sort((a, b) => Number(b.isPredefined) - Number(a.isPredefined) || b.count - a.count || a.planName.localeCompare(b.planName));
  return { period, total: items.length, byStatus, byPlan, byActivity: { active, inactive: items.length - active } };
}

function directoryUser(db: MockDatabase, user: UserRow, period: string): AdminUserListItem {
  const account = db.accounts.get(user.accountId)!;
  return {
    ...db.userWithQuota(user, period),
    account: { id: account.id, name: account.name },
    activity: db.activity((row) => row.userId === user.id, period),
  };
}

const isActive = (activity: { acceptedRequests: number; rejectedRequests: number }) => activity.acceptedRequests + activity.rejectedRequests > 0;

export function createMockDirectoryService(): DirectoryService {
  return {
    accountFacets: (params) =>
      simulate((db) => {
        requireAdmin();
        const query = validate(accountFacetsQuerySchema, params);
        const period = query.month ?? db.currentPeriod();
        const items = [...db.accounts.values()]
          .filter((account) => !query.search || accountMatches(db, account, query.search))
          .map((account) => db.accountListItem(account, period))
          .map((account) => ({ status: account.quota.status, planId: account.quota.planId, active: isActive(account.activity) }));
        return facetsOf(db, items, period);
      }),

    listUsers: (params) =>
      simulate((db) => {
        requireAdmin();
        const query = validate(adminListUsersQuerySchema, params);
        const period = query.month ?? db.currentPeriod();
        const direction = query.order === 'asc' ? 1 : -1;
        const items = [...db.users.values()]
          .filter((user) => !query.search || userMatches(user, query.search))
          .filter((user) => !query.accountId || user.accountId === query.accountId)
          .filter((user) => !query.planId || user.planId === query.planId)
          .filter((user) => !query.createdFrom || user.createdAt.slice(0, 10) >= query.createdFrom)
          .filter((user) => !query.createdTo || user.createdAt.slice(0, 10) <= query.createdTo)
          .map((user) => directoryUser(db, user, period))
          .filter((user) => !query.status || user.quota.status === query.status)
          .filter((user) => query.minUtilization === undefined || user.quota.utilizationPercent >= query.minUtilization)
          .filter((user) => query.maxUtilization === undefined || user.quota.utilizationPercent <= query.maxUtilization)
          .filter((user) => !query.activity || (query.activity === 'active') === isActive(user.activity))
          .sort((a, b) => {
            if (query.sort === 'lastActivity') return compareNullsLast(a.activity.lastRequestAt, b.activity.lastRequestAt, direction) || a.id.localeCompare(b.id) * direction;
            const primary =
              query.sort === 'externalUserId'
                ? a.externalUserId.localeCompare(b.externalUserId)
                : query.sort === 'accountName'
                  ? a.account.name.localeCompare(b.account.name)
                  : query.sort === 'utilization'
                    ? a.quota.utilizationPercent - b.quota.utilizationPercent
                    : query.sort === 'consumed'
                      ? a.quota.consumed - b.quota.consumed
                      : query.sort === 'rejected'
                        ? a.activity.rejectedRequests - b.activity.rejectedRequests
                        : a.createdAt.localeCompare(b.createdAt);
            return (primary || a.id.localeCompare(b.id)) * direction;
          });
        return pageOf(items, query);
      }),

    userFacets: (params) =>
      simulate((db) => {
        requireAdmin();
        const query = validate(userFacetsQuerySchema, params);
        const period = query.month ?? db.currentPeriod();
        const items = [...db.users.values()]
          .filter((user) => !query.search || userMatches(user, query.search))
          .filter((user) => !query.accountId || user.accountId === query.accountId)
          .map((user) => directoryUser(db, user, period))
          .map((user) => ({ status: user.quota.status, planId: user.quota.planId, active: isActive(user.activity) }));
        return facetsOf(db, items, period);
      }),

    search: (q) =>
      simulate((db) => {
        requireAdmin();
        const text = validate(adminSearchQuerySchema, { q }).q.toLowerCase();
        const accounts = [...db.accounts.values()]
          .filter((account) => account.name.toLowerCase().includes(text) || account.id.includes(text) || account.apiKeyPrefix.toLowerCase().includes(text))
          .sort((a, b) => Number(b.name.toLowerCase().startsWith(text)) - Number(a.name.toLowerCase().startsWith(text)) || a.name.localeCompare(b.name))
          .slice(0, 6)
          .map((account) => ({
            id: account.id,
            name: account.name,
            apiKeyPrefix: account.apiKeyPrefix,
            planName: db.plans.get(account.planId)!.name,
            userCount: db.accountUsers(account.id).length,
          }));
        const users = [...db.users.values()]
          .filter((user) => userMatches(user, text))
          .sort((a, b) => Number(b.externalUserId.toLowerCase() === text) - Number(a.externalUserId.toLowerCase() === text) || a.externalUserId.localeCompare(b.externalUserId))
          .slice(0, 6)
          .map((user) => ({
            id: user.id,
            externalUserId: user.externalUserId,
            displayName: user.displayName,
            accountId: user.accountId,
            accountName: db.accounts.get(user.accountId)!.name,
          }));
        return { accounts, users };
      }),
  };
}
