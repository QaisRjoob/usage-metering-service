import { assignPlanSchema } from '../../contracts';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../container';
import { validate } from '../../Shared/Validation/validate';
import { accountOf, monthQuery } from '../Schemas/params';

/** Account scope (X-API-Key): the calling account itself. */
export function registerAccountRoutes(app: FastifyInstance, container: Container): void {
  app.get('/account', async (request) => container.accounts.getCurrent.execute(accountOf(request).id));

  app.put('/account/plan', async (request) => {
    const account = accountOf(request);
    const { planId } = validate(assignPlanSchema, request.body);
    await container.accounts.assignPlan.execute(account.id, planId);
    request.log.info({ accountId: account.id, planId }, 'account plan changed');
    return container.accounts.getCurrent.execute(account.id);
  });

  app.get('/account/usage-summary', async (request) =>
    container.usage.accountSummary.execute(accountOf(request).id, validate(monthQuery, request.query).month),
  );
}
