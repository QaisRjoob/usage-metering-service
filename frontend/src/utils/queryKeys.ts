import type { AdminListSignupRequestsParams } from '@/contracts';
import type { ListAccountsParams } from '@/models/account';
import type { AccountFacetsParams, AdminListUsersParams, CompanyStatsParams, UserFacetsParams } from '@/models/directory';
import type { AdminListPlansParams, ListPlansParams } from '@/models/plan';
import type { AdminListUsageParams, ListUsageParams } from '@/models/usage-record';
import type { AccountUserFacetsParams, ListUsersParams } from '@/models/user';
import type { QuotasParams } from '@/services/quotaService';

/**
 * Stable query keys. Operator data lives under ['admin', ...]; account data under
 * ['account', accountId, ...]. The account id is the cache scope - the API key itself never
 * appears in a key.
 */
export const queryKeys = {
  admin: {
    all: ['admin'] as const,
    summary: (month: string) => ['admin', 'summary', month] as const,
    accounts: (params: ListAccountsParams) => ['admin', 'accounts', params] as const,
    accountFacets: (params: AccountFacetsParams) => ['admin', 'accounts', 'facets', params] as const,
    users: (params: AdminListUsersParams) => ['admin', 'users', params] as const,
    userFacets: (params: UserFacetsParams) => ['admin', 'users', 'facets', params] as const,
    search: (text: string) => ['admin', 'search', text] as const,
    accountSummary: (accountId: string, month: string) => ['admin', 'account', accountId, 'summary', month] as const,
    userOverview: (accountId: string, userId: string, month: string) => ['admin', 'account', accountId, 'user', userId, month] as const,
    companyStats: (params: CompanyStatsParams) => ['admin', 'companies', params] as const,
    signupRequests: (params: AdminListSignupRequestsParams) => ['admin', 'signup-requests', params] as const,
    account: (accountId: string, month: string) => ['admin', 'account', accountId, month] as const,
    accountUsers: (accountId: string, params: ListUsersParams) => ['admin', 'account', accountId, 'users', params] as const,
    usage: (params: AdminListUsageParams) => ['admin', 'usage', params] as const,
    plans: (params: AdminListPlansParams) => ['admin', 'plans', params] as const,
    ai: (question: string, month: string) => ['admin', 'ai', question, month] as const,
  },
  account: {
    all: (accountId: string) => ['account', accountId] as const,
    current: (accountId: string) => ['account', accountId, 'current'] as const,
    users: (accountId: string, params: ListUsersParams) => ['account', accountId, 'users', params] as const,
    user: (accountId: string, userId: string) => ['account', accountId, 'user', userId] as const,
    plans: (accountId: string, params: ListPlansParams) => ['account', accountId, 'plans', params] as const,
    plan: (accountId: string, planId: string) => ['account', accountId, 'plan', planId] as const,
    quotas: (accountId: string, params: QuotasParams) => ['account', accountId, 'quotas', params] as const,
    usageSummary: (accountId: string, month: string) => ['account', accountId, 'usage-summary', month] as const,
    usage: (accountId: string, params: ListUsageParams) => ['account', accountId, 'usage', params] as const,
    userFacets: (accountId: string, params: AccountUserFacetsParams) => ['account', accountId, 'user-facets', params] as const,
    userOverview: (accountId: string, userId: string, month: string) => ['account', accountId, 'user-overview', userId, month] as const,
  },
};

/** staleTime per kind of data. Quotas change with every consume call, so they go stale fast. */
export const staleTimes = {
  quota: 3_000,
  usage: 5_000,
  summary: 10_000,
  accounts: 15_000,
  plans: 60_000,
} as const;
