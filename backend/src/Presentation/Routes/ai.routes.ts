import { createHash } from 'node:crypto';
import { aiAdvisorRequestSchema } from '../../contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Container } from '../../container';
import { API_KEY_HEADER, bearerToken, requireAnyRole } from '../../Shared/Middleware/auth';
import { validate } from '../../Shared/Validation/validate';

/**
 * Rate-limit bucket per caller, computed before authentication: the subject of a bearer token
 * (so a refreshed token keeps the same bucket), else the hashed API key, else the client IP.
 * A forged token only picks a bucket; it is rejected by the preHandler right after.
 */
function rateLimitKey(request: FastifyRequest): string {
  const token = bearerToken(request);
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sub?: unknown };
      if (typeof payload.sub === 'string') return `sub:${payload.sub}`;
    } catch {
      // not a JWT: fall through to the hashed credential
    }
  }
  const credential = request.headers[API_KEY_HEADER] ?? token;
  const value = Array.isArray(credential) ? credential[0] : credential;
  return value ? createHash('sha256').update(value).digest('hex').slice(0, 32) : request.ip;
}

export function registerAiRoutes(app: FastifyInstance, container: Container): void {
  const { config } = container;
  app.post(
    '/ai/advisor',
    {
      preHandler: requireAnyRole((key) => container.accounts.authenticate.execute(key), (token) => container.auth.verify(token)),
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
