import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Container } from './container';
import { registerErrorHandling } from './Presentation/errorHandler';
import { buildOpenApiDocument } from './Presentation/OpenAPI/openapi';
import { registerAccountRoutes } from './Presentation/Routes/accounts.routes';
import { registerAdminRoutes } from './Presentation/Routes/admin.routes';
import { registerAiRoutes } from './Presentation/Routes/ai.routes';
import { registerAuthRoutes } from './Presentation/Routes/auth.routes';
import { registerHealthRoutes } from './Presentation/Routes/health.routes';
import { registerPlanRoutes } from './Presentation/Routes/plans.routes';
import { registerQuotaRoutes } from './Presentation/Routes/quotas.routes';
import { registerSignupRoutes } from './Presentation/Routes/signup.routes';
import { registerUsageRoutes } from './Presentation/Routes/usage.routes';
import { registerUserRoutes } from './Presentation/Routes/users.routes';
import { requireAccount } from './Shared/Middleware/auth';
import { AuthFailureLimiter } from './Shared/Middleware/authFailureLimiter';
import { generateRequestId } from './Shared/Middleware/requestId';

export const API_PREFIX = '/api/v1';

export interface BuildAppOptions {
  logger?: boolean;
}

/** Builds the Fastify app around a container. Does not listen (tests use app.inject). */
export async function buildApp(container: Container, options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const { config } = container;
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            // Credentials never reach the logs.
            redact: { paths: ['req.headers.authorization', 'req.headers["x-api-key"]'], censor: '[redacted]' },
          },
    genReqId: generateRequestId,
    bodyLimit: 64 * 1024,
    // Idle-socket limit. It must outlast the slowest handler: the AI advisor waits for the provider
    // (OPENAI_TIMEOUT_MS, retried once by the SDK), during which the socket sends nothing.
    connectionTimeout: Math.max(15_000, 2 * config.OPENAI_TIMEOUT_MS + 10_000),
    // Time allowed to receive the whole request (headers and body), not to answer it.
    requestTimeout: 30_000,
    // Never "true": then any client could set X-Forwarded-For and pick its own IP. Either the exact
    // proxy addresses (the web container) or a hop count; by default no proxy is trusted.
    trustProxy:
      config.TRUST_PROXY_ADDRESSES.length > 0
        ? config.TRUST_PROXY_ADDRESSES
        : config.TRUST_PROXY_HOPS > 0
          ? (_address: string, hop: number) => hop < config.TRUST_PROXY_HOPS
          : false,
  });

  const authFailures = new AuthFailureLimiter(config.AUTH_FAILURE_LIMIT_PER_MINUTE);
  registerErrorHandling(app, authFailures);
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id', 'X-Requested-With'],
    // The refresh cookie is sent only to the same origin in the web app; credentials are allowed
    // for listed origins that call the API directly (e.g. a dev server on another port).
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
  });
  // Opt-in per route (AI advisor, account creation) so the hot consume path is not throttled here.
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  await app.register(swagger, { mode: 'static', specification: { document: buildOpenApiDocument(API_PREFIX) as never } });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  app.get(`${API_PREFIX}/openapi.json`, async () => app.swagger());
  app.get('/', async (_request, reply) => reply.redirect('/docs'));

  await app.register(
    async (api) => {
      registerHealthRoutes(api, container);
      registerAdminRoutes(api, container);
      registerAiRoutes(api, container);
      registerAuthRoutes(api, container, API_PREFIX);
      registerSignupRoutes(api, container);
      // Account scope: an account JWT access token or the account API key (X-API-Key).
      await api.register(async (accountScope) => {
        accountScope.addHook('preHandler', requireAccount((key) => container.accounts.authenticate.execute(key), (token) => container.auth.verify(token)));
        registerAccountRoutes(accountScope, container);
        registerUserRoutes(accountScope, container);
        registerPlanRoutes(accountScope, container);
        registerQuotaRoutes(accountScope, container);
        registerUsageRoutes(accountScope, container);
      });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
