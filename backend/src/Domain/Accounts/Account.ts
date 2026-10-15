/** A calling application (tenant). Its plan's limits are shared by all of its users. */
export interface Account {
  id: string;
  name: string;
  apiKeyPrefix: string;
  planId: string;
  createdAt: Date;
}

/** The identity attached to an authenticated account-scoped request. */
export interface AuthenticatedAccount {
  id: string;
  name: string;
}
