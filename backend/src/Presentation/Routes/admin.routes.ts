import {
  accountFacetsQuerySchema,
  adminListPlansQuerySchema,
  adminListUsageQuerySchema,
  adminListUsersQuerySchema,
  adminSearchQuerySchema,
  createAccountSchema,
  listAccountsQuerySchema,
  listUsersQuerySchema,
  userFacetsQuerySchema,
} from '../../contracts';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../container';
import { accountNotFound } from '../../Domain/Accounts/AccountErrors';
import { requireAdmin } from '../../Shared/Middleware/auth';
import { validate } from '../../Shared/Validation/validate';
import { accountIdParams, monthQuery } from '../Schemas/params';

/**
 * Operator endpoints (Authorization: Bearer ADMIN_API_TOKEN). They read across accounts but do not
 * replace the account API key: account-scoped changes (users, plans) still require that key.
 */
export function registerAdminRoutes(app: FastifyInstance, container: Container): void {
  app.register(async (admin) => {
    admin.addHook('preHandler', requireAdmin(container.config.ADMIN_API_TOKEN));

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

    admin.get('/admin/plans', async (request) => container.plans.listAll.execute(validate(adminListPlansQuerySchema, request.query)));

    admin.get('/admin/usage', async (request) => container.usage.list.execute(validate(adminListUsageQuerySchema, request.query)));

    admin.get('/admin/analytics/summary', async (request) => container.usage.adminAnalytics.execute(validate(monthQuery, request.query).month));
  });
}
