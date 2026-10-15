import { consumeRequestSchema, listUsageQuerySchema } from '../../contracts';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../container';
import { validate } from '../../Shared/Validation/validate';
import { accountOf, usageIdParams } from '../Schemas/params';

/** Account scope (X-API-Key). */
export function registerUsageRoutes(app: FastifyInstance, container: Container): void {
  /**
   * Consume: route -> ConsumeUnitsCommand -> QuotaPolicy.evaluateRequest -> one SQL transaction.
   * Accepted and rejected decisions both answer 200; `accepted` tells them apart.
   */
  app.post('/usage/consume', async (request, reply) => {
    const account = accountOf(request);
    const decision = await container.usage.consume.execute(validate(consumeRequestSchema, request.body), {
      accountId: account.id,
      correlationId: request.id,
    });
    request.log.info(
      { accountId: account.id, decision: decision.accepted ? 'accepted' : 'rejected', rule: decision.rejection?.rule, level: decision.rejection?.level, replay: decision.idempotentReplay },
      'consume decision',
    );
    if (decision.idempotentReplay) reply.header('Idempotent-Replayed', 'true');
    return decision;
  });

  app.get('/usage', async (request) => {
    const query = validate(listUsageQuerySchema, request.query);
    // The account filter always comes from the API key, never from the client.
    return container.usage.list.execute({ ...query, accountId: accountOf(request).id });
  });

  app.get('/usage/:usageId', async (request) => {
    const { usageId } = validate(usageIdParams, request.params);
    return container.usage.get.execute(accountOf(request).id, usageId);
  });
}
