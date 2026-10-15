import type { AccountRepository } from '../Modules/Accounts/Interfaces/AccountRepository';
import type { PlanRepository } from '../Modules/Plans/Interfaces/PlanRepository';
import type { QuotaRepository } from '../Modules/Quotas/Interfaces/QuotaRepository';
import type { UsageRepository } from '../Modules/Usage/Interfaces/UsageRepository';
import type { UserRepository } from '../Modules/Users/Interfaces/UserRepository';

/** Repositories bound to one database transaction. */
export interface Repositories {
  accounts: AccountRepository;
  users: UserRepository;
  plans: PlanRepository;
  quotas: QuotaRepository;
  usage: UsageRepository;
}

/**
 * Explicit transaction boundary. Everything done through `repos` inside `work` commits together
 * or rolls back together.
 */
export interface TransactionManager {
  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}
