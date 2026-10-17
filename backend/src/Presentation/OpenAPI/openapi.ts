import {
  accountFacetsQuerySchema,
  accountUserFacetsQuerySchema,
  adminListPlansQuerySchema,
  adminListUsageQuerySchema,
  adminListUsersQuerySchema,
  adminListSignupRequestsQuerySchema,
  adminSearchQuerySchema,
  approveSignupSchema,
  rejectSignupSchema,
  signupCredentialsSchema,
  submitSignupRequestSchema,
  tokenRequestSchema,
  companyStatsQuerySchema,
  userFacetsQuerySchema,
  aiAdvisorRequestSchema,
  assignPlanSchema,
  consumeRequestSchema,
  createAccountSchema,
  createPlanSchema,
  createUserSchema,
  listAccountsQuerySchema,
  listPlansQuerySchema,
  listUsageQuerySchema,
  listUsersQuerySchema,
  quotaCheckRequestSchema,
  quotasQuerySchema,
  updatePlanSchema,
} from '../../contracts';
import { z, type ZodObject, type ZodType } from 'zod';
import { monthQuery } from '../Schemas/params';

/**
 * OpenAPI 3.1 document served at /api/v1/openapi.json (Swagger UI at /docs).
 * Request schemas are generated from the same zod schemas the handlers validate with, so they
 * cannot drift. Response bodies reference the main shared shapes; the complete TypeScript types
 * live in backend/src/contracts and are described in docs/API_CONTRACTS.md.
 */
type Security = 'apiKey' | 'admin' | 'either' | 'none';

interface RouteDoc {
  method: 'get' | 'post' | 'put' | 'patch';
  path: string;
  tag: string;
  summary: string;
  security: Security;
  params?: string[];
  query?: ZodObject;
  body?: ZodType;
  status?: number;
  response: string;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const page = (item: string) => ({ allOf: [ref('Page'), { type: 'object', properties: { items: { type: 'array', items: ref(item) } } }] });

const routes: RouteDoc[] = [
  { method: 'get', path: '/health', tag: 'Health', summary: 'Liveness', security: 'none', response: 'Status' },
  { method: 'get', path: '/ready', tag: 'Health', summary: 'Readiness (checks PostgreSQL)', security: 'none', response: 'Status' },

  { method: 'post', path: '/auth/token', tag: 'Auth', summary: 'Sign in: exchange an account API key or the operator token for a JWT access token (refresh token set as an HttpOnly cookie)', security: 'none', body: tokenRequestSchema, response: 'Object' },
  { method: 'post', path: '/auth/refresh', tag: 'Auth', summary: 'New access token from the refresh cookie (the refresh token is rotated). Requires X-Requested-With: umk-web', security: 'none', response: 'Object' },
  { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Revoke the session and clear the refresh cookie. Requires X-Requested-With: umk-web', security: 'none', status: 204, response: 'Object' },
  { method: 'post', path: '/signup-requests', tag: 'Sign-up', summary: 'Request an account (public). Returns a request id and a claim code, shown once', security: 'none', body: submitSignupRequestSchema, status: 201, response: 'Object' },
  { method: 'post', path: '/signup-requests/status', tag: 'Sign-up', summary: 'Status of your request (request id + claim code)', security: 'none', body: signupCredentialsSchema, response: 'Object' },
  { method: 'post', path: '/signup-requests/claim', tag: 'Sign-up', summary: 'Collect the API key of an approved request, once', security: 'none', body: signupCredentialsSchema, response: 'Object' },
  { method: 'get', path: '/admin/signup-requests', tag: 'Operator', summary: 'Sign-up requests with counts per status', security: 'admin', query: adminListSignupRequestsQuerySchema, response: 'Object' },
  { method: 'post', path: '/admin/signup-requests/{requestId}/approve', tag: 'Operator', summary: 'Approve a request: creates the account (the company then claims its key)', security: 'admin', params: ['requestId'], body: approveSignupSchema, response: 'Object' },
  { method: 'post', path: '/admin/signup-requests/{requestId}/reject', tag: 'Operator', summary: 'Deny a request with a reason the company can read', security: 'admin', params: ['requestId'], body: rejectSignupSchema, response: 'Object' },
  { method: 'post', path: '/admin/accounts', tag: 'Operator', summary: 'Create an account; the API key is returned once', security: 'admin', body: createAccountSchema, status: 201, response: 'CreateAccountResponse' },
  { method: 'get', path: '/admin/accounts', tag: 'Operator', summary: 'List accounts with their account quota', security: 'admin', query: listAccountsQuerySchema, response: 'Page<AccountListItem>' },
  { method: 'get', path: '/admin/accounts/facets', tag: 'Operator', summary: 'Account counts per status, plan and activity (within search)', security: 'admin', query: accountFacetsQuerySchema, response: 'Object' },
  { method: 'get', path: '/admin/accounts/{accountId}', tag: 'Operator', summary: 'Account details for a month', security: 'admin', params: ['accountId'], query: monthQuery, response: 'Object' },
  { method: 'get', path: '/admin/accounts/{accountId}/users', tag: 'Operator', summary: "An account's users with their quota", security: 'admin', params: ['accountId'], query: listUsersQuerySchema, response: 'Page<UserWithQuota>' },
  { method: 'get', path: '/admin/users', tag: 'Operator', summary: 'Users directory: users of every account with quota and activity', security: 'admin', query: adminListUsersQuerySchema, response: 'Page<Object>' },
  { method: 'get', path: '/admin/users/facets', tag: 'Operator', summary: 'User counts per status, plan and activity (within search / account)', security: 'admin', query: userFacetsQuerySchema, response: 'Object' },
  { method: 'get', path: '/admin/search', tag: 'Operator', summary: 'Finder: companies (name, id, key prefix) and users (id, name) matching q', security: 'admin', query: adminSearchQuerySchema, response: 'Object' },
  { method: 'get', path: '/admin/accounts/{accountId}/usage-summary', tag: 'Operator', summary: 'Company statistics for a month: requests, daily series, rejections by rule, top users, 6-month trend', security: 'admin', params: ['accountId'], query: monthQuery, response: 'Object' },
  { method: 'get', path: '/admin/accounts/{accountId}/users/{userId}', tag: 'Operator', summary: 'One user of a company: plan, both quotas, requests, daily series, rejections, 6-month trend', security: 'admin', params: ['accountId', 'userId'], query: monthQuery, response: 'Object' },
  { method: 'get', path: '/admin/analytics/companies', tag: 'Operator', summary: 'Statistics per company (usage, share, requests, rejection rate, active users) with totals', security: 'admin', query: companyStatsQuerySchema, response: 'Object' },
  { method: 'get', path: '/admin/plans', tag: 'Operator', summary: 'Plan catalogue: predefined and every account’s custom plans', security: 'admin', query: adminListPlansQuerySchema, response: 'Page<Plan>' },
  { method: 'get', path: '/admin/usage', tag: 'Operator', summary: 'Request history across accounts', security: 'admin', query: adminListUsageQuerySchema, response: 'Page<UsageRecord>' },
  { method: 'get', path: '/admin/analytics/summary', tag: 'Operator', summary: 'Dashboard metrics across accounts', security: 'admin', query: monthQuery, response: 'Object' },

  { method: 'get', path: '/account', tag: 'Account', summary: 'The calling account, its plan and quota', security: 'apiKey', response: 'Object' },
  { method: 'put', path: '/account/plan', tag: 'Account', summary: 'Assign or switch the account plan (keeps consumed units)', security: 'apiKey', body: assignPlanSchema, response: 'Object' },
  { method: 'get', path: '/account/usage-summary', tag: 'Account', summary: 'Account usage summary for a month', security: 'apiKey', query: monthQuery, response: 'Object' },

  { method: 'get', path: '/users', tag: 'Users', summary: 'List users with their individual quota', security: 'apiKey', query: listUsersQuerySchema, response: 'Page<UserWithQuota>' },
  { method: 'post', path: '/users', tag: 'Users', summary: 'Register a user (default plan: Basic)', security: 'apiKey', body: createUserSchema, status: 201, response: 'UserWithQuota' },
  { method: 'get', path: '/users/{userId}', tag: 'Users', summary: 'User, plan and both quota levels', security: 'apiKey', params: ['userId'], response: 'Object' },
  { method: 'put', path: '/users/{userId}/plan', tag: 'Users', summary: "Assign or switch a user's plan (keeps consumed units)", security: 'apiKey', params: ['userId'], body: assignPlanSchema, response: 'Object' },
  { method: 'get', path: '/users/{userId}/usage-summary', tag: 'Users', summary: 'User usage summary for a month', security: 'apiKey', params: ['userId'], query: monthQuery, response: 'Object' },
  { method: 'get', path: '/users/{userId}/overview', tag: 'Users', summary: 'One user: plan, both quotas, activity, daily series, rejections and a 6-month trend', security: 'apiKey', params: ['userId'], query: monthQuery, response: 'Object' },
  { method: 'get', path: '/account/user-facets', tag: 'Users', summary: 'Your users per status, plan and activity (within search)', security: 'apiKey', query: accountUserFacetsQuerySchema, response: 'Object' },

  { method: 'get', path: '/plans', tag: 'Plans', summary: 'Predefined plans and the accountâ€™s custom plans', security: 'apiKey', query: listPlansQuerySchema, response: 'Page<Plan>' },
  { method: 'post', path: '/plans', tag: 'Plans', summary: 'Create a custom plan', security: 'apiKey', body: createPlanSchema, status: 201, response: 'Plan' },
  { method: 'get', path: '/plans/{planId}', tag: 'Plans', summary: 'Plan with all versions', security: 'apiKey', params: ['planId'], response: 'Plan' },
  { method: 'patch', path: '/plans/{planId}', tag: 'Plans', summary: 'Update a custom plan (limit changes create a new version; predefined â†’ 403)', security: 'apiKey', params: ['planId'], body: updatePlanSchema, response: 'Plan' },

  { method: 'get', path: '/quotas', tag: 'Quotas', summary: 'Account quota and a page of user quotas (current month)', security: 'apiKey', query: quotasQuerySchema, response: 'Object' },
  { method: 'post', path: '/quotas/check', tag: 'Quotas', summary: 'Dry run: evaluate without consuming or recording', security: 'apiKey', body: quotaCheckRequestSchema, response: 'QuotaCheckResult' },

  { method: 'post', path: '/usage/consume', tag: 'Usage', summary: 'Consume units if both plans allow it (idempotent by requestId)', security: 'apiKey', body: consumeRequestSchema, response: 'ConsumeDecision' },
  { method: 'get', path: '/usage', tag: 'Usage', summary: 'Request history (accepted and rejected), newest first', security: 'apiKey', query: listUsageQuerySchema, response: 'Page<UsageRecord>' },
  { method: 'get', path: '/usage/{usageId}', tag: 'Usage', summary: 'One usage record', security: 'apiKey', params: ['usageId'], response: 'UsageRecord' },

  { method: 'post', path: '/ai/advisor', tag: 'AI', summary: 'Ask the usage advisor (API key: one account; admin token: all accounts)', security: 'either', body: aiAdvisorRequestSchema, response: 'Object' },
];

const quotaSnapshot = {
  type: 'object',
  required: ['level', 'period', 'planId', 'planName', 'planVersionId', 'planVersion', 'monthlyAllowance', 'maxUnitsPerRequest', 'consumed', 'remaining', 'utilizationPercent', 'status'],
  properties: {
    level: { type: 'string', enum: ['account', 'user'] },
    period: { type: 'string', example: '2026-10' },
    planId: { type: 'string', format: 'uuid' },
    planName: { type: 'string' },
    planVersionId: { type: 'string', format: 'uuid' },
    planVersion: { type: 'integer' },
    monthlyAllowance: { type: 'integer' },
    maxUnitsPerRequest: { type: 'integer' },
    consumed: { type: 'integer' },
    remaining: { type: 'integer', description: 'max(0, monthlyAllowance - consumed)' },
    utilizationPercent: { type: 'number', description: 'Actual ratio; can exceed 100' },
    status: { type: 'string', enum: ['ok', 'warning', 'exhausted', 'over_allowance'] },
  },
};

const ruleViolation = {
  type: 'object',
  properties: {
    rule: { type: 'string', enum: ['MAX_UNITS_PER_REQUEST', 'MONTHLY_ALLOWANCE'] },
    level: { type: 'string', enum: ['account', 'user'] },
    limit: { type: 'integer' },
    requested: { type: 'integer' },
    remaining: { type: ['integer', 'null'] },
    message: { type: 'string' },
  },
};

const components = {
  securitySchemes: {
    apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'Account API key (issued once at account creation), for server-to-server clients.' },
    bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT access token from POST /auth/token (role operator or account), 15 minutes.' },
  },
  schemas: {
    Error: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          required: ['code', 'message', 'requestId'],
          properties: {
            code: { type: 'string', example: 'USER_NOT_FOUND' },
            message: { type: 'string' },
            requestId: { type: ['string', 'null'] },
            details: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } } },
          },
        },
      },
    },
    Page: {
      type: 'object',
      required: ['items', 'page', 'pageSize', 'totalItems', 'totalPages', 'hasNextPage', 'hasPreviousPage'],
      properties: {
        items: { type: 'array', items: {} },
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
        totalItems: { type: 'integer' },
        totalPages: { type: 'integer' },
        hasNextPage: { type: 'boolean' },
        hasPreviousPage: { type: 'boolean' },
      },
    },
    QuotaSnapshot: quotaSnapshot,
    RuleViolation: ruleViolation,
    ConsumeDecision: {
      type: 'object',
      properties: {
        usageRecordId: { type: 'string', format: 'uuid' },
        requestId: { type: 'string' },
        userId: { type: 'string' },
        units: { type: 'integer' },
        accepted: { type: 'boolean' },
        rejection: { oneOf: [ref('RuleViolation'), { type: 'null' }] },
        violations: { type: 'array', items: ref('RuleViolation') },
        account: ref('QuotaSnapshot'),
        user: ref('QuotaSnapshot'),
        period: { type: 'string' },
        processedAt: { type: 'string', format: 'date-time' },
        idempotentReplay: { type: 'boolean' },
      },
    },
    QuotaCheckResult: {
      type: 'object',
      properties: {
        dryRun: { const: true },
        allowed: { type: 'boolean' },
        rejection: { oneOf: [ref('RuleViolation'), { type: 'null' }] },
        violations: { type: 'array', items: ref('RuleViolation') },
        account: ref('QuotaSnapshot'),
        user: ref('QuotaSnapshot'),
      },
    },
    UsageRecord: { type: 'object', description: 'See UsageRecord in backend/src/contracts/usage.ts' },
    UserWithQuota: { type: 'object', properties: { id: { type: 'string' }, externalUserId: { type: 'string' }, displayName: { type: ['string', 'null'] }, quota: ref('QuotaSnapshot') } },
    AccountListItem: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, apiKeyPrefix: { type: 'string' }, userCount: { type: 'integer' }, quota: ref('QuotaSnapshot'), activity: { type: 'object', properties: { acceptedRequests: { type: 'integer' }, rejectedRequests: { type: 'integer' }, lastRequestAt: { type: ['string', 'null'] } } } } },
    CreateAccountResponse: { type: 'object', properties: { account: ref('AccountListItem'), apiKey: { type: 'string', description: 'Shown once. Store it securely.' } } },
    Plan: { type: 'object', description: 'See Plan / PlanDetails in backend/src/contracts/plans.ts' },
    Status: { type: 'object', properties: { status: { type: 'string' } } },
    Object: { type: 'object', description: 'See the TypeScript contract in backend/src/contracts and docs/API_CONTRACTS.md' },
  },
};

function responseSchema(name: string): object {
  const match = name.match(/^Page<(.+)>$/);
  return match ? page(match[1]!) : ref(name);
}

function securityFor(security: Security): object[] | undefined {
  if (security === 'none') return [];
  // Operator routes: an operator JWT. Account routes: an account JWT or the API key.
  if (security === 'admin') return [{ bearer: [] }];
  return [{ bearer: [] }, { apiKey: [] }];
}

function queryParameters(schema: ZodObject): object[] {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as { properties?: Record<string, object>; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([name, property]) => ({ name, in: 'query', required: json.required?.includes(name) ?? false, schema: property }));
}

const errorResponse = (description: string) => ({ description, content: { 'application/json': { schema: ref('Error') } } });

export function buildOpenApiDocument(serverUrl: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const parameters = [
      ...(route.params ?? []).map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
      ...(route.query ? queryParameters(route.query) : []),
    ];
    const responses: Record<string, unknown> = {
      [String(route.status ?? 200)]: { description: 'Success', content: { 'application/json': { schema: responseSchema(route.response) } } },
    };
    if (route.body || route.query || route.params) responses['400'] = errorResponse('Validation error');
    if (route.security !== 'none') responses['401'] = errorResponse('Missing or invalid credential');
    if (route.path === '/auth/identify') responses['401'] = errorResponse('CREDENTIAL_INVALID: neither the admin token nor a known API key');
    if (route.params) responses['404'] = errorResponse('Not found (including resources of other accounts)');
    if (route.path === '/usage/consume') responses['409'] = errorResponse('IDEMPOTENCY_KEY_REUSED');
    if (route.path.startsWith('/plans/') && route.method === 'patch') responses['403'] = errorResponse('PLAN_READ_ONLY');

    paths[route.path] ??= {};
    paths[route.path]![route.method] = {
      tags: [route.tag],
      summary: route.summary,
      security: securityFor(route.security),
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(route.body ? { requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(route.body, { io: 'input', unrepresentable: 'any' }) } } } } : {}),
      responses,
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Usage Metering & Quota Service',
      version: '1.0.0',
      description:
        'Two-level quota enforcement: every consume request must satisfy the account plan (shared) and the user plan (individual). A rejection returns 200 with accepted=false. See docs/API_CONTRACTS.md.',
    },
    servers: [{ url: serverUrl }],
    paths,
    components,
  };
}
