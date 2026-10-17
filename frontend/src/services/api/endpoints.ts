/** Every API path used by the web app, relative to apiConfig.baseUrl (".../api/v1"). */
const segment = (value: string): string => encodeURIComponent(value);

export const endpoints = {
  health: '/health',

  auth: {
    token: '/auth/token',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
  },

  signup: {
    submit: '/signup-requests',
    status: '/signup-requests/status',
    claim: '/signup-requests/claim',
  },
  ready: '/ready',

  admin: {
    accounts: '/admin/accounts',
    account: (accountId: string) => `/admin/accounts/${segment(accountId)}`,
    accountFacets: '/admin/accounts/facets',
    accountUsers: (accountId: string) => `/admin/accounts/${segment(accountId)}/users`,
    users: '/admin/users',
    userFacets: '/admin/users/facets',
    search: '/admin/search',
    accountUsageSummary: (accountId: string) => `/admin/accounts/${segment(accountId)}/usage-summary`,
    accountUser: (accountId: string, userId: string) => `/admin/accounts/${segment(accountId)}/users/${segment(userId)}`,
    companyStats: '/admin/analytics/companies',
    signupRequests: '/admin/signup-requests',
    approveSignup: (requestId: string) => `/admin/signup-requests/${segment(requestId)}/approve`,
    rejectSignup: (requestId: string) => `/admin/signup-requests/${segment(requestId)}/reject`,
    plans: '/admin/plans',
    usage: '/admin/usage',
    analyticsSummary: '/admin/analytics/summary',
  },

  account: {
    current: '/account',
    plan: '/account/plan',
    usageSummary: '/account/usage-summary',
    userFacets: '/account/user-facets',
  },

  users: {
    list: '/users',
    detail: (userId: string) => `/users/${segment(userId)}`,
    plan: (userId: string) => `/users/${segment(userId)}/plan`,
    usageSummary: (userId: string) => `/users/${segment(userId)}/usage-summary`,
    overview: (userId: string) => `/users/${segment(userId)}/overview`,
  },

  plans: {
    list: '/plans',
    detail: (planId: string) => `/plans/${segment(planId)}`,
  },

  quotas: {
    overview: '/quotas',
    check: '/quotas/check',
  },

  usage: {
    consume: '/usage/consume',
    list: '/usage',
    detail: (usageId: string) => `/usage/${segment(usageId)}`,
  },

  ai: {
    advisor: '/ai/advisor',
  },
} as const;
