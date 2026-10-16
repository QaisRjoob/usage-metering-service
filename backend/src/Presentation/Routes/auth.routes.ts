import type { FastifyInstance } from 'fastify';
import { identifyCredentialSchema } from '../../contracts';
import type { Container } from '../../container';
import { validate } from '../../Shared/Validation/validate';

/** Public (unauthenticated) login helper. Rate-limited per IP against token guessing. */
export function registerAuthRoutes(app: FastifyInstance, container: Container): void {
  app.post('/auth/identify', { config: { rateLimit: { max: container.config.LOGIN_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } }, async (request) => {
    const { token } = validate(identifyCredentialSchema, request.body);
    const result = await container.accounts.identify.execute(token);
    // The token itself is never logged; only who signed in.
    request.log.info({ role: result.role, accountId: result.role === 'account' ? result.account.id : undefined }, 'credential identified');
    return result;
  });
}
