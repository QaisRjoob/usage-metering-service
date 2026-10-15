import type { AuthenticatedAccount } from '../Domain/Accounts/Account';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the API-key preHandler for account-scoped routes. */
    account?: AuthenticatedAccount;
    /** Set by the admin-token preHandler for operator routes. */
    isAdmin?: boolean;
  }
}
