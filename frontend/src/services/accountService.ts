import type {
  AccountDetails,
  AccountListItem,
  CreateAccountRequest,
  CreateAccountResponse,
  CurrentAccountResponse,
  ListAccountsParams,
} from '@/models/account';
import type { PaginatedResponse } from '@/models/pagination';
import type { ListUsersParams, UserWithQuota } from '@/models/user';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

export interface AccountService {
  /** Operator: paginated accounts with their account-level quota. */
  listAccounts(params: ListAccountsParams): Promise<PaginatedResponse<AccountListItem>>;
  /** Operator: one account, its plan and quota for a month. */
  getAccount(accountId: string, month?: string): Promise<AccountDetails>;
  /** Operator: an account's users with their individual quota for a month (read-only). */
  listAccountUsers(accountId: string, params: ListUsersParams): Promise<PaginatedResponse<UserWithQuota>>;
  /** Operator: creates an account and returns its API key once. */
  createAccount(request: CreateAccountRequest): Promise<CreateAccountResponse>;
  /** Account scope: the account identified by the connected API key. */
  getCurrentAccount(): Promise<CurrentAccountResponse>;
  /** Account scope: validates a key before it is stored as the connected credential. */
  verifyApiKey(apiKey: string): Promise<CurrentAccountResponse>;
  /** Account scope: assigns or switches the account plan. */
  assignAccountPlan(planId: string): Promise<CurrentAccountResponse>;
}

export function createHttpAccountService(): AccountService {
  return {
    listAccounts: (params) => apiRequest(endpoints.admin.accounts, { auth: 'admin', query: { ...params } }),
    getAccount: (accountId, month) => apiRequest(endpoints.admin.account(accountId), { auth: 'admin', query: { month } }),
    listAccountUsers: (accountId, params) =>
      apiRequest(endpoints.admin.accountUsers(accountId), { auth: 'admin', query: { ...params } }),
    createAccount: (request) => apiRequest(endpoints.admin.accounts, { method: 'POST', auth: 'admin', body: request }),
    getCurrentAccount: () => apiRequest(endpoints.account.current, { auth: 'account' }),
    verifyApiKey: (apiKey) => apiRequest(endpoints.account.current, { auth: { apiKey } }),
    assignAccountPlan: (planId) => apiRequest(endpoints.account.plan, { method: 'PUT', auth: 'account', body: { planId } }),
  };
}
