import { accountUserFacetsQuerySchema, assignPlanSchema, createUserSchema, listUsersQuerySchema } from '../../contracts';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../container';
import { validate } from '../../Shared/Validation/validate';
import { accountOf, monthQuery, userIdParams } from '../Schemas/params';

/** Account scope (X-API-Key). `:userId` is the caller's externalUserId. */
export function registerUserRoutes(app: FastifyInstance, container: Container): void {
  app.get('/users', async (request) => container.users.list.execute(accountOf(request).id, validate(listUsersQuerySchema, request.query)));

  app.post('/users', async (request, reply) => {
    const user = await container.users.register.execute(accountOf(request).id, validate(createUserSchema, request.body));
    return reply.status(201).send(user);
  });

  app.get('/users/:userId', async (request) => {
    const { userId } = validate(userIdParams, request.params);
    return container.users.get.execute(accountOf(request).id, userId);
  });

  app.put('/users/:userId/plan', async (request) => {
    const account = accountOf(request);
    const { userId } = validate(userIdParams, request.params);
    const { planId } = validate(assignPlanSchema, request.body);
    await container.users.assignPlan.execute(account.id, userId, planId);
    request.log.info({ accountId: account.id, userId, planId }, 'user plan changed');
    return container.users.get.execute(account.id, userId);
  });

  app.get('/users/:userId/overview', async (request) => {
    const { userId } = validate(userIdParams, request.params);
    return container.directory.userOverview.execute(accountOf(request).id, userId, validate(monthQuery, request.query).month);
  });

  // Not under /users/: "facets" could be a real externalUserId.
  app.get('/account/user-facets', async (request) => {
    const query = validate(accountUserFacetsQuerySchema, request.query);
    return container.directory.userFacets.execute({ ...query, accountId: accountOf(request).id });
  });

  app.get('/users/:userId/usage-summary', async (request) => {
    const { userId } = validate(userIdParams, request.params);
    return container.usage.userSummary.execute(accountOf(request).id, userId, validate(monthQuery, request.query).month);
  });
}
