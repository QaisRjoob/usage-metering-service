import { externalUserIdSchema, idSchema, monthSchema, paginationQuerySchema } from '../../contracts';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthenticatedAccount } from '../../Domain/Accounts/Account';

/** Path and query schemas specific to the HTTP layer; bodies use the shared contract schemas. */
export const accountIdParams = z.object({ accountId: idSchema });
export const userIdParams = z.object({ userId: externalUserIdSchema });
export const planIdParams = z.object({ planId: idSchema });
export const usageIdParams = z.object({ usageId: idSchema });
export const monthQuery = z.object({ month: monthSchema.optional() });
export const quotasQuery = paginationQuerySchema.extend({
  search: z.string().trim().max(128).optional(),
  status: z.enum(['ok', 'warning', 'exhausted', 'over_allowance']).optional(),
});

/** The account resolved from the API key by the preHandler. */
export function accountOf(request: FastifyRequest): AuthenticatedAccount {
  if (!request.account) throw new Error('Account-scoped route reached without API-key authentication');
  return request.account;
}
