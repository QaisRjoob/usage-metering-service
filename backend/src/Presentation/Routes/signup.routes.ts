import type { FastifyInstance } from 'fastify';
import { signupCredentialsSchema, submitSignupRequestSchema } from '../../contracts';
import type { Container } from '../../container';
import { validate } from '../../Shared/Validation/validate';

/**
 * Public self-service sign-up (no credential). Submitting is rate-limited per IP against spam;
 * status and claim take the request id + claim code in the body and share the login limit.
 */
export function registerSignupRoutes(app: FastifyInstance, container: Container): void {
  const perMinute = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } });

  app.post('/signup-requests', perMinute(container.config.SIGNUP_RATE_LIMIT_PER_MINUTE), async (request, reply) => {
    const result = await container.signup.submit.execute(validate(submitSignupRequestSchema, request.body));
    request.log.info({ signupRequestId: result.requestId }, 'sign-up request submitted');
    return reply.status(201).send(result);
  });

  app.post('/signup-requests/status', perMinute(container.config.LOGIN_RATE_LIMIT_PER_MINUTE), async (request) =>
    container.signup.status.execute(validate(signupCredentialsSchema, request.body)),
  );

  app.post('/signup-requests/claim', perMinute(container.config.LOGIN_RATE_LIMIT_PER_MINUTE), async (request) => {
    const result = await container.signup.claim.execute(validate(signupCredentialsSchema, request.body));
    // The key itself is never logged.
    request.log.info({ accountId: result.account.id }, 'sign-up API key claimed');
    return result;
  });
}
