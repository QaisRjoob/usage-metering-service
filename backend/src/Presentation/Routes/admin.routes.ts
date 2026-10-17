import {
  accountFacetsQuerySchema,
  adminListPlansQuerySchema,
  adminListUsageQuerySchema,
  adminListUsersQuerySchema,
  adminListSignupRequestsQuerySchema,
  adminSearchQuerySchema,
  approveSignupSchema,
  companyStatsQuerySchema,
  createAccountSchema,
  listAccountsQuerySchema,
  listUsersQuerySchema,
  rejectSignupSchema,
  userFacetsQuerySchema,
} from '../../contracts';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../container';
import { accountNotFound } from '../../Domain/Accounts/AccountErrors';
import { requireOperator } from '../../Shared/Middleware/auth';
import { validate } from '../../Shared/Validation/validate';
import { accountIdParams, monthQuery, signupRequestParams, userIdParams } from '../Schemas/params';

/**
 * Operator endpoints (Authorization: Bearer ADMIN_API_TOKEN). They read across accounts but do not
 * replace the account API key: account-scoped changes (users, plans) still require that key.
 */
const accountUserParams = accountIdParams.extend(userIdParams.shape);

export function registerAdminRoutes(app: FastifyInstance, container: Container): void {
  app.register(async (admin) => {
    admin.addHook('preHandler', requireOperator((token) => container.auth.verify(token)));

    admin.post('/admin/accounts', { config: { rateLimit: { max: container.config.ACCOUNT_CREATE_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } }, async (request, reply) => {
      const result = await container.accounts.create.execute(validate(createAccountSchema, request.body));
      request.log.info({ accountId: result.account.id }, 'account created');
      return reply.status(201).send(result);
    });

    admin.get('/admin/accounts', async (request) => container.accounts.list.execute(validate(listAccountsQuerySchema, request.query)));

    // Registered before /admin/accounts/:accountId; Fastify prefers static segments anyway.
    admin.get('/admin/accounts/facets', async (request) => container.accounts.facets.execute(validate(accountFacetsQuerySchema, request.query)));

    admin.get('/admin/accounts/:accountId', async (request) => {
      const { accountId } = validate(accountIdParams, request.params);
      return container.accounts.getDetails.execute(accountId, validate(monthQuery, request.query).month);
    });

    admin.get('/admin/accounts/:accountId/users', async (request) => {
      const { accountId } = validate(accountIdParams, request.params);
      const query = validate(listUsersQuerySchema, request.query);
      if (!(await container.accounts.exists(accountId))) throw accountNotFound();
      return container.users.list.execute(accountId, query);
    });

    admin.get('/admin/users', async (request) => container.directory.users.execute(validate(adminListUsersQuerySchema, request.query)));

    admin.get('/admin/users/facets', async (request) => container.directory.userFacets.execute(validate(userFacetsQuerySchema, request.query)));

    admin.get('/admin/search', async (request) => container.directory.search.execute(validate(adminSearchQuerySchema, request.query).q));

    admin.get('/admin/accounts/:accountId/usage-summary', async (request) => {
      const { accountId } = validate(accountIdParams, request.params);
      return container.directory.accountSummary.execute(accountId, validate(monthQuery, request.query).month);
    });

    admin.get('/admin/accounts/:accountId/users/:userId', async (request) => {
      const { accountId, userId } = validate(accountUserParams, request.params);
      return container.directory.userOverview.execute(accountId, userId, validate(monthQuery, request.query).month);
    });

    admin.get('/admin/analytics/companies', async (request) => container.directory.companyStats.execute(validate(companyStatsQuerySchema, request.query)));

    admin.get('/admin/signup-requests', async (request) => container.signup.list.execute(validate(adminListSignupRequestsQuerySchema, request.query)));

    admin.post('/admin/signup-requests/:requestId/approve', async (request) => {
      const { requestId } = validate(signupRequestParams, request.params);
      const result = await container.signup.approve.execute(requestId, validate(approveSignupSchema, request.body ?? {}));
      request.log.info({ signupRequestId: requestId, accountId: result.account?.id }, 'sign-up request approved');
      return result;
    });

    admin.post('/admin/signup-requests/:requestId/reject', async (request) => {
      const { requestId } = validate(signupRequestParams, request.params);
      const result = await container.signup.reject.execute(requestId, validate(rejectSignupSchema, request.body).note);
      request.log.info({ signupRequestId: requestId }, 'sign-up request rejected');
      return result;
    });

    admin.get('/admin/plans', async (request) => container.plans.listAll.execute(validate(adminListPlansQuerySchema, request.query)));

    admin.get('/admin/usage', async (request) => container.usage.list.execute(validate(adminListUsageQuerySchema, request.query)));

    admin.get('/admin/analytics/summary', async (request) => container.usage.adminAnalytics.execute(validate(monthQuery, request.query).month));
  });
}
