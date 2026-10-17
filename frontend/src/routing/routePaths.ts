/**
 * Two separate interfaces, one per role, each under its own URL prefix:
 * - /admin/* for the operator (signed in with the admin token)
 * - /app/*   for a company account (signed in with its API key)
 */
export const routePaths = {
  login: '/login',
  signup: '/signup',
  signupStatus: '/signup/status',
  operator: {
    root: '/admin',
    accounts: '/admin/accounts',
    accountDetails: '/admin/accounts/:accountId',
    userDetails: '/admin/accounts/:accountId/users/:userId',
    companies: '/admin/companies',
    requests: '/admin/requests',
    users: '/admin/users',
    plans: '/admin/plans',
    usage: '/admin/usage',
    advisor: '/admin/advisor',
  },
  account: {
    root: '/app',
    users: '/app/users',
    userDetails: '/app/users/:userId',
    plans: '/app/plans',
    quotas: '/app/quotas',
    usage: '/app/usage',
    demo: '/app/demo',
    advisor: '/app/advisor',
  },
} as const;

export const buildAccountDetailsPath = (accountId: string): string => `/admin/accounts/${encodeURIComponent(accountId)}`;

/** Operator view of one user of a company (userId = the company's externalUserId). */
export const buildOperatorUserPath = (accountId: string, userId: string): string => `/admin/accounts/${encodeURIComponent(accountId)}/users/${encodeURIComponent(userId)}`;

/** A company's own view of one of its users. */
export const buildAccountUserPath = (userId: string): string => `/app/users/${encodeURIComponent(userId)}`;

export const homeFor = (role: 'operator' | 'account'): string => (role === 'operator' ? routePaths.operator.root : routePaths.account.root);
