import type { PaginatedResponse } from '@/models/pagination';
import type { CreateUserRequest, ListUsersParams, UserDetails, UserWithQuota } from '@/models/user';
import type { UserUsageSummary } from '@/models/usage-summary';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

/** Account scope (X-API-Key). `userId` is always the caller's externalUserId. */
export interface UserService {
  listUsers(params: ListUsersParams): Promise<PaginatedResponse<UserWithQuota>>;
  getUser(userId: string): Promise<UserDetails>;
  createUser(request: CreateUserRequest): Promise<UserWithQuota>;
  assignUserPlan(userId: string, planId: string): Promise<UserDetails>;
  getUserUsageSummary(userId: string, month?: string): Promise<UserUsageSummary>;
}

export function createHttpUserService(): UserService {
  return {
    listUsers: (params) => apiRequest(endpoints.users.list, { auth: 'account', query: { ...params } }),
    getUser: (userId) => apiRequest(endpoints.users.detail(userId), { auth: 'account' }),
    createUser: (request) => apiRequest(endpoints.users.list, { method: 'POST', auth: 'account', body: request }),
    assignUserPlan: (userId, planId) =>
      apiRequest(endpoints.users.plan(userId), { method: 'PUT', auth: 'account', body: { planId } }),
    getUserUsageSummary: (userId, month) =>
      apiRequest(endpoints.users.usageSummary(userId), { auth: 'account', query: { month } }),
  };
}
