import { createPlanSchema, listPlansQuerySchema, updatePlanSchema } from '../../contracts';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../container';
import { validate } from '../../Shared/Validation/validate';
import { accountOf, planIdParams } from '../Schemas/params';

/** Account scope (X-API-Key): predefined plans plus the account's own custom plans. */
export function registerPlanRoutes(app: FastifyInstance, container: Container): void {
  app.get('/plans', async (request) => container.plans.list.execute(accountOf(request).id, validate(listPlansQuerySchema, request.query)));

  app.post('/plans', async (request, reply) => {
    const plan = await container.plans.create.execute(accountOf(request).id, validate(createPlanSchema, request.body));
    return reply.status(201).send(plan);
  });

  app.get('/plans/:planId', async (request) => {
    const { planId } = validate(planIdParams, request.params);
    return container.plans.get.execute(accountOf(request).id, planId);
  });

  app.patch('/plans/:planId', async (request) => {
    const account = accountOf(request);
    const { planId } = validate(planIdParams, request.params);
    await container.plans.update.execute(account.id, planId, validate(updatePlanSchema, request.body));
    request.log.info({ accountId: account.id, planId }, 'plan updated');
    return container.plans.get.execute(account.id, planId);
  });
}
