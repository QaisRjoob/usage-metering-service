import type {
  AccountFacets,
  AdminAccountUsageSummary,
  AdminUserOverview,
  CompanyStatsParams,
  CompanyStatsResponse,
  AccountFacetsParams,
  AdminListUsersParams,
  AdminSearchResult,
  AdminUserListItem,
  UserFacets,
  UserFacetsParams,
} from '@/models/directory';
import type { PaginatedResponse } from '@/models/pagination';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

/** Operator-only lookups across every company: category counts, users directory, finder. */
export interface DirectoryService {
  /** Accounts per status, plan and activity (within `search`). */
  accountFacets(params: AccountFacetsParams): Promise<AccountFacets>;
  /** Users of every company with their quota, company and activity. */
  listUsers(params: AdminListUsersParams): Promise<PaginatedResponse<AdminUserListItem>>;
  /** Users per status, plan and activity (within `search` and `accountId`). */
  userFacets(params: UserFacetsParams): Promise<UserFacets>;
  /** Header finder: a few companies and users matching the text. */
  search(q: string): Promise<AdminSearchResult>;
  /** One company's statistics for a month, with a 6-month trend. */
  accountUsageSummary(accountId: string, month?: string): Promise<AdminAccountUsageSummary>;
  /** One user of a company: plan, quotas, requests, daily series and trend. */
  userOverview(accountId: string, userId: string, month?: string): Promise<AdminUserOverview>;
  /** Statistics of every company for a month, with totals. */
  companyStats(params: CompanyStatsParams): Promise<CompanyStatsResponse>;
}

export function createHttpDirectoryService(): DirectoryService {
  return {
    accountFacets: (params) => apiRequest(endpoints.admin.accountFacets, { auth: 'admin', query: { ...params } }),
    listUsers: (params) => apiRequest(endpoints.admin.users, { auth: 'admin', query: { ...params } }),
    userFacets: (params) => apiRequest(endpoints.admin.userFacets, { auth: 'admin', query: { ...params } }),
    search: (q) => apiRequest(endpoints.admin.search, { auth: 'admin', query: { q } }),
    accountUsageSummary: (accountId, month) => apiRequest(endpoints.admin.accountUsageSummary(accountId), { auth: 'admin', query: { month } }),
    userOverview: (accountId, userId, month) => apiRequest(endpoints.admin.accountUser(accountId, userId), { auth: 'admin', query: { month } }),
    companyStats: (params) => apiRequest(endpoints.admin.companyStats, { auth: 'admin', query: { ...params } }),
  };
}
