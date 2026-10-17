import type { ApiErrorBody, ErrorCode } from '../contracts';
import type { FastifyError, FastifyInstance } from 'fastify';
import { isAppError } from '../Shared/Errors/AppError';
import { CREDENTIAL_FAILURE_CODES, type AuthFailureLimiter } from '../Shared/Middleware/authFailureLimiter';
import { HTTP_STATUS_BY_CODE } from '../Shared/Errors/httpStatus';

function body(code: ErrorCode, message: string, requestId: string, details?: ApiErrorBody['error']['details']): ApiErrorBody {
  return { error: { code, message, requestId, ...(details ? { details } : {}) } };
}

/**
 * One place that turns errors into the documented error envelope:
 * - AppError -> its code and mapped status
 * - Fastify client errors (bad JSON, body too large, rate limit) -> 4xx with a stable code
 * - anything else -> 500 INTERNAL_ERROR, logged with the stack, never exposed to the client
 */
export function registerErrorHandling(app: FastifyInstance, authFailures?: AuthFailureLimiter): void {
  // A client that keeps presenting wrong credentials is stopped before any route runs.
  if (authFailures) {
    app.addHook('onRequest', async (request, reply) => {
      if (authFailures.isBlocked(request.ip)) {
        return reply.status(429).send(body('RATE_LIMITED', 'Too many failed sign-in attempts. Wait a minute and try again.', request.id));
      }
    });
  }

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (isAppError(error)) {
      if (authFailures && CREDENTIAL_FAILURE_CODES.has(error.code)) {
        authFailures.recordFailure(request.ip);
        request.log.warn({ code: error.code, ip: request.ip }, 'credential rejected');
      }
      const status = HTTP_STATUS_BY_CODE[error.code];
      if (status >= 500) request.log.error({ err: error }, 'request failed');
      return reply.status(status).send(body(error.code, error.message, request.id, error.details));
    }
    if (error.statusCode === 429) {
      return reply.status(429).send(body('RATE_LIMITED', 'Too many requests. Slow down and retry later.', request.id));
    }
    if (error.statusCode === 413) {
      return reply.status(413).send(body('VALIDATION_ERROR', 'Request body is too large.', request.id));
    }
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(400).send(body('VALIDATION_ERROR', error.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || error.code?.startsWith('FST_ERR_CTP') ? 'Request body must be valid JSON.' : error.message, request.id));
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send(body('INTERNAL_ERROR', 'An unexpected error occurred.', request.id));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(body('NOT_FOUND', `Route ${request.method} ${request.url.split('?')[0]} not found.`, request.id));
  });
}
