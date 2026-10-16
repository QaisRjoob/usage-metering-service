/**
 * Two separate interfaces, one per role, each under its own URL prefix:
 * - /admin/* for the operator (signed in with the admin token)
 * - /app/*   for a company account (signed in with its API key)
 */
export const routePaths = {
  login: '/login',
  operator: {
    root: '/admin',
    accounts: '/admin/accounts',
    accountDetails: '/admin/accounts/:accountId',
    plans: '/admin/plans',
    usage: '/admin/usage',
    advisor: '/admin/advisor',
  },
  account: {
    root: '/app',
    users: '/app/users',
    plans: '/app/plans',
    quotas: '/app/quotas',
    usage: '/app/usage',
    demo: '/app/demo',
    advisor: '/app/advisor',
  },
} as const;

export const buildAccountDetailsPath = (accountId: string): string => `/admin/accounts/${encodeURIComponent(accountId)}`;

export const homeFor = (role: 'operator' | 'account'): string => (role === 'operator' ? routePaths.operator.root : routePaths.account.root);
