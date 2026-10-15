import type { FastifyInstance } from 'fastify';
import type { Container } from '../../container';

export function registerHealthRoutes(app: FastifyInstance, container: Container): void {
  /** Liveness: the process is up and serving HTTP. */
  app.get('/health', async () => ({ status: 'ok' }));

  /** Readiness: PostgreSQL answers a trivial query within a short timeout. */
  app.get('/ready', async (request, reply) => {
    try {
      await Promise.race([
        container.pool.query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('database check timed out')), 2_000)),
      ]);
      return { status: 'ready', checks: { database: 'ok' } };
    } catch (error) {
      request.log.warn({ err: error }, 'readiness check failed');
      return reply.status(503).send({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is not reachable.', requestId: request.id },
      });
    }
  });
}
