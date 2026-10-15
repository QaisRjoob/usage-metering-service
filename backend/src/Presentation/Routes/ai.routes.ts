import { createHash } from 'node:crypto';
import { aiAdvisorRequestSchema } from '../../contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Container } from '../../container';
import { API_KEY_HEADER, requireApiKeyOrAdmin } from '../../Shared/Middleware/auth';
import { validate } from '../../Shared/Validation/validate';

/** Rate-limit bucket per credential (hashed, so keys never end up in memory maps as-is), else per IP. */
function rateLimitKey(request: FastifyRequest): string {
  const credential = request.headers[API_KEY_HEADER] ?? request.headers.authorization;
  const value = Array.isArray(credential) ? credential[0] : credential;
  return value ? createHash('sha256').update(value).digest('hex').slice(0, 32) : request.ip;
}

export function registerAiRoutes(app: FastifyInstance, container: Container): void {
  const { config } = container;
  app.post(
    '/ai/advisor',
    {
      preHandler: requireApiKeyOrAdmin((key) => container.accounts.authenticate.execute(key), config.ADMIN_API_TOKEN),
      config: { rateLimit: { max: config.AI_RATE_LIMIT_PER_WINDOW, timeWindow: config.AI_RATE_LIMIT_WINDOW_MS, keyGenerator: rateLimitKey } },
    },
    async (request) => {
      const body = validate(aiAdvisorRequestSchema, request.body);
      const caller = request.account ? ({ kind: 'account', account: request.account } as const) : ({ kind: 'admin' } as const);
      // The question itself is not logged (it may contain sensitive text).
      request.log.info({ scope: caller.kind, accountId: request.account?.id }, 'ai advisor question');
      return container.ai.ask.execute(caller, body);
    },
  );
}
