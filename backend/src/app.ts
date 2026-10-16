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
import { registerUsageRoutes } from './Presentation/Routes/usage.routes';
import { registerUserRoutes } from './Presentation/Routes/users.routes';
import { requireApiKey } from './Shared/Middleware/auth';
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
    connectionTimeout: 15_000,
    requestTimeout: 30_000,
    trustProxy: true,
  });

  registerErrorHandling(app);
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
  });
  // Opt-in per route (AI advisor, account creation) so the hot consume path is not throttled here.
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
      registerAuthRoutes(api, container);
      // Account scope: every route below requires X-API-Key.
      await api.register(async (accountScope) => {
        accountScope.addHook('preHandler', requireApiKey((key) => container.accounts.authenticate.execute(key)));
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
