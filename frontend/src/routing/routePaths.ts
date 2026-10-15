export const routePaths = {
  dashboard: '/',
  accounts: '/accounts',
  accountDetails: '/accounts/:accountId',
  plans: '/plans',
  quotas: '/quotas',
  usage: '/usage',
  clientDemo: '/demo',
  aiAdvisor: '/advisor',
} as const;

export const buildAccountDetailsPath = (accountId: string): string => `/accounts/${encodeURIComponent(accountId)}`;
