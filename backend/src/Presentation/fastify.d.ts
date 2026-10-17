import type { Role } from '../contracts';
import type { AuthenticatedAccount } from '../Domain/Accounts/Account';

declare module 'fastify' {
  interface FastifyRequest {
    /** The account of an account-scoped request (from the API key or the account access token). */
    account?: AuthenticatedAccount;
    /** Role of the verified caller. */
    role?: Role;
  }
}
