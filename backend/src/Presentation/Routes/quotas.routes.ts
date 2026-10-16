import { quotaCheckRequestSchema, quotasQuerySchema } from '../../contracts';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../container';
import { validate } from '../../Shared/Validation/validate';
import { accountOf } from '../Schemas/params';

/** Account scope (X-API-Key). */
export function registerQuotaRoutes(app: FastifyInstance, container: Container): void {
  app.get('/quotas', async (request) => container.quotas.overview.execute(accountOf(request).id, validate(quotasQuerySchema, request.query)));

  /** Dry run: never consumes, never records. */
  app.post('/quotas/check', async (request) => container.quotas.check.execute(accountOf(request).id, validate(quotaCheckRequestSchema, request.body)));
}
