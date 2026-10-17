import type { PaginatedResponse } from '@/models/pagination';
import type { UserFacets } from '@/models/directory';
import type { AccountUserFacetsParams, CreateUserRequest, ListUsersParams, UserDetails, UserListItem, UserOverview, UserWithQuota } from '@/models/user';
import type { UserUsageSummary } from '@/models/usage-summary';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

/** Account scope (X-API-Key). `userId` is always the caller's externalUserId. */
export interface UserService {
  listUsers(params: ListUsersParams): Promise<PaginatedResponse<UserListItem>>;
  /** Your users per status, plan and activity (within `search`). */
  userFacets(params: AccountUserFacetsParams): Promise<UserFacets>;
  /** One of your users: plan, both quotas, activity, daily series and a 6-month trend. */
  getUserOverview(userId: string, month?: string): Promise<UserOverview>;
  getUser(userId: string): Promise<UserDetails>;
  createUser(request: CreateUserRequest): Promise<UserWithQuota>;
  assignUserPlan(userId: string, planId: string): Promise<UserDetails>;
  getUserUsageSummary(userId: string, month?: string): Promise<UserUsageSummary>;
}

export function createHttpUserService(): UserService {
  return {
    listUsers: (params) => apiRequest(endpoints.users.list, { auth: 'account', query: { ...params } }),
    userFacets: (params) => apiRequest(endpoints.account.userFacets, { auth: 'account', query: { ...params } }),
    getUserOverview: (userId, month) => apiRequest(endpoints.users.overview(userId), { auth: 'account', query: { month } }),
    getUser: (userId) => apiRequest(endpoints.users.detail(userId), { auth: 'account' }),
    createUser: (request) => apiRequest(endpoints.users.list, { method: 'POST', auth: 'account', body: request }),
    assignUserPlan: (userId, planId) =>
      apiRequest(endpoints.users.plan(userId), { method: 'PUT', auth: 'account', body: { planId } }),
    getUserUsageSummary: (userId, month) =>
      apiRequest(endpoints.users.usageSummary(userId), { auth: 'account', query: { month } }),
  };
}
