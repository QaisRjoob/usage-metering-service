import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { CSRF_HEADER, CSRF_HEADER_VALUE, REFRESH_COOKIE, tokenRequestSchema } from '../../contracts';
import type { IssuedSession } from '../../Application/Modules/Auth/AuthUseCases';
import type { Container } from '../../container';
import { AppError } from '../../Shared/Errors/AppError';
import { validate } from '../../Shared/Validation/validate';

/**
 * JWT sessions (public routes). The refresh token lives in an HttpOnly, SameSite=Strict cookie
 * scoped to /api/v1/auth, so page scripts never see it and it is only sent to these routes.
 * Refresh and logout also require a custom header: a cross-site form or image cannot add one,
 * which blocks cross-site request forgery even if a browser ignored SameSite.
 */
export function registerAuthRoutes(app: FastifyInstance, container: Container, apiPrefix: string): void {
  const { config } = container;
  const cookiePath = `${apiPrefix}/auth`;
  const limited = { config: { rateLimit: { max: config.LOGIN_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } };

  const setRefreshCookie = (reply: FastifyReply, session: IssuedSession) =>
    reply.setCookie(REFRESH_COOKIE, session.refreshToken.raw, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'strict',
      path: cookiePath,
      expires: session.refreshToken.expiresAt,
    });
  const clearRefreshCookie = (reply: FastifyReply) => reply.clearCookie(REFRESH_COOKIE, { path: cookiePath, httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'strict' });
  const requireCsrfHeader = (request: FastifyRequest) => {
    if (request.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
      throw new AppError('VALIDATION_ERROR', `Send the ${CSRF_HEADER}: ${CSRF_HEADER_VALUE} header with this request.`);
    }
  };

  app.post('/auth/token', limited, async (request, reply) => {
    const { token } = validate(tokenRequestSchema, request.body);
    const session = await container.auth.issue.execute(token);
    // The credential itself is never logged; only who signed in.
    request.log.info({ role: session.response.role, accountId: session.response.account?.id }, 'session started');
    setRefreshCookie(reply, session);
    return session.response;
  });

  app.post('/auth/refresh', limited, async (request, reply) => {
    requireCsrfHeader(request);
    try {
      const session = await container.auth.refresh.execute(request.cookies[REFRESH_COOKIE]);
      setRefreshCookie(reply, session);
      return session.response;
    } catch (error) {
      clearRefreshCookie(reply);
      throw error;
    }
  });

  app.post('/auth/logout', async (request, reply) => {
    requireCsrfHeader(request);
    await container.auth.logout.execute(request.cookies[REFRESH_COOKIE]);
    clearRefreshCookie(reply);
    return reply.status(204).send();
  });
}
