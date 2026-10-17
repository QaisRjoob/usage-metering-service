import { systemClock, type Clock } from './Application/Common/Clock';
import { AskAdvisorQuery } from './Application/Modules/AI/Queries/AskAdvisorQuery';
import type { AIProvider } from './Application/Modules/AI/Interfaces/AIProvider';
import { AssignAccountPlanCommand } from './Application/Modules/Accounts/Commands/AssignAccountPlanCommand';
import { CreateAccountCommand } from './Application/Modules/Accounts/Commands/CreateAccountCommand';
import { AuthenticateApiKeyQuery } from './Application/Modules/Accounts/Queries/AuthenticateApiKeyQuery';
import { IdentifyCredentialQuery } from './Application/Modules/Accounts/Queries/IdentifyCredentialQuery';
import { IssueTokenCommand, RefreshTokenCommand, RevokeSessionCommand } from './Application/Modules/Auth/AuthUseCases';
import { JoseAccessTokenService } from './Infrastructure/Auth/JoseAccessTokenService';
import { GetAccountDetailsQuery } from './Application/Modules/Accounts/Queries/GetAccountDetailsQuery';
import { GetCurrentAccountQuery } from './Application/Modules/Accounts/Queries/GetCurrentAccountQuery';
import { ListAccountsQuery } from './Application/Modules/Accounts/Queries/ListAccountsQuery';
import { GetAdminAccountUsageSummaryQuery, GetAdminUserOverviewQuery, GetCompanyStatsQuery } from './Application/Modules/Directory/Queries/OperatorInsightQueries';
import { AdminSearchQuery, GetAccountFacetsQuery, GetUserFacetsQuery, ListDirectoryUsersQuery } from './Application/Modules/Directory/Queries/DirectoryQueries';
import { CreatePlanCommand } from './Application/Modules/Plans/Commands/CreatePlanCommand';
import { UpdatePlanCommand } from './Application/Modules/Plans/Commands/UpdatePlanCommand';
import { GetPlanQuery } from './Application/Modules/Plans/Queries/GetPlanQuery';
import { ListAllPlansQuery } from './Application/Modules/Plans/Queries/ListAllPlansQuery';
import { ListPlansQuery } from './Application/Modules/Plans/Queries/ListPlansQuery';
import { CheckQuotaQuery } from './Application/Modules/Quotas/Queries/CheckQuotaQuery';
import { GetQuotasOverviewQuery } from './Application/Modules/Quotas/Queries/GetQuotasOverviewQuery';
import { ConsumeUnitsCommand } from './Application/Modules/Usage/Commands/ConsumeUnitsCommand';
import { GetAdminAnalyticsQuery } from './Application/Modules/Usage/Queries/GetAdminAnalyticsQuery';
import { GetUsageRecordQuery } from './Application/Modules/Usage/Queries/GetUsageRecordQuery';
import { GetAccountUsageSummaryQuery, GetUserUsageSummaryQuery } from './Application/Modules/Usage/Queries/GetUsageSummaryQueries';
import { ListUsageQuery } from './Application/Modules/Usage/Queries/ListUsageQuery';
import { AssignUserPlanCommand } from './Application/Modules/Users/Commands/AssignUserPlanCommand';
import { RegisterUserCommand } from './Application/Modules/Users/Commands/RegisterUserCommand';
import { GetUserQuery } from './Application/Modules/Users/Queries/GetUserQuery';
import { ListUsersQuery } from './Application/Modules/Users/Queries/ListUsersQuery';
import { ApproveSignupCommand, ClaimSignupCommand, GetSignupStatusQuery, ListSignupRequestsQuery, RejectSignupCommand, SubmitSignupRequestCommand } from './Application/Modules/Signup/SignupUseCases';
import type { AppConfig } from './config/env';
import { safeEqual } from './Shared/Middleware/auth';
import type { Pool } from './Infrastructure/Database/postgres';
import { PostgresTransactionManager, createRepositories } from './Infrastructure/Database/transaction-manager';
import { CachedApiKeyAccountRepository } from './Infrastructure/Repositories/CachedApiKeyAccountRepository';
import { PostgresAnalyticsRepository } from './Infrastructure/Repositories/PostgresAnalyticsRepository';
import { createAIProvider } from './Infrastructure/AI/Configuration/createAIProvider';

export interface ContainerOptions {
  config: AppConfig;
  pool: Pool;
  clock?: Clock;
  /** Clock for token lifetimes (default: system time). */
  authClock?: Clock;
  aiProvider?: AIProvider;
  onTransactionRetry?: (attempt: number, code: string) => void;
  /** Called when a used refresh token is presented again (its whole session was revoked). */
  onRefreshReuse?: (familyId: string) => void;
}

/**
 * Composition root: the only place that knows concrete classes. Everything else receives its
 * dependencies through constructors. Tests pass their own clock and AI provider.
 */
export function createContainer(options: ContainerOptions) {
  const { config, pool } = options;
  const clock = options.clock ?? systemClock;
  // Repositories bound to the pool for single-statement reads/writes; transactions get their own.
  const repos = createRepositories(pool);
  const transactions = new PostgresTransactionManager(pool, options.onTransactionRetry);
  const analytics = new PostgresAnalyticsRepository(pool);
  const aiProvider = options.aiProvider ?? createAIProvider(config);

  const apiKeyCache = new CachedApiKeyAccountRepository(repos.accounts);
  const authenticate = new AuthenticateApiKeyQuery(apiKeyCache);
  const identify = new IdentifyCredentialQuery(authenticate, (token) => safeEqual(token, config.ADMIN_API_TOKEN));
  // Token lifetimes follow real time; tests move `clock` across months for quota periods only.
  const authClock = options.authClock ?? systemClock;
  const accessTokens = new JoseAccessTokenService(config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS, authClock);
  const refreshTtlMs = config.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
  const accountUsageSummary = new GetAccountUsageSummaryQuery(repos.accounts, repos.users, repos.usage, clock);
  const adminAnalytics = new GetAdminAnalyticsQuery(analytics, repos.accounts, repos.usage, clock);
  const userUsageSummary = new GetUserUsageSummaryQuery(repos.accounts, repos.users, repos.usage, clock);

  return {
    config,
    pool,
    clock,
    aiProvider,
    auth: {
      issue: new IssueTokenCommand(identify, accessTokens, repos.refreshTokens, authClock, refreshTtlMs),
      refresh: new RefreshTokenCommand(transactions, accessTokens, authClock, refreshTtlMs, options.onRefreshReuse),
      logout: new RevokeSessionCommand(transactions, authClock),
      verify: (token: string) => accessTokens.verify(token),
    },
    accounts: {
      authenticate,
      create: new CreateAccountCommand(repos.accounts, repos.plans, clock),
      assignPlan: new AssignAccountPlanCommand(transactions, clock),
      getCurrent: new GetCurrentAccountQuery(repos.accounts, repos.plans, clock),
      list: new ListAccountsQuery(repos.accounts, clock),
      getDetails: new GetAccountDetailsQuery(repos.accounts, repos.usage, clock),
      facets: new GetAccountFacetsQuery(repos.accounts, clock),
      exists: async (accountId: string) => (await repos.accounts.findById(accountId)) !== null,
    },
    users: {
      register: new RegisterUserCommand(repos.users, repos.plans, clock),
      assignPlan: new AssignUserPlanCommand(transactions, clock),
      list: new ListUsersQuery(repos.users, clock),
      get: new GetUserQuery(repos.accounts, repos.users, repos.plans, clock),
    },
    directory: {
      users: new ListDirectoryUsersQuery(repos.users, clock),
      userFacets: new GetUserFacetsQuery(repos.users, clock),
      search: new AdminSearchQuery(repos.accounts, repos.users),
      accountSummary: new GetAdminAccountUsageSummaryQuery(accountUsageSummary, repos.usage, clock),
      userOverview: new GetAdminUserOverviewQuery(userUsageSummary, repos.accounts, repos.plans, repos.usage, clock),
      companyStats: new GetCompanyStatsQuery(analytics, clock),
    },
    signup: {
      submit: new SubmitSignupRequestCommand(repos.signupRequests, repos.plans, clock),
      status: new GetSignupStatusQuery(repos.signupRequests),
      claim: new ClaimSignupCommand(transactions, clock, (previousHash) => apiKeyCache.invalidate(previousHash)),
      list: new ListSignupRequestsQuery(repos.signupRequests),
      approve: new ApproveSignupCommand(transactions, clock),
      reject: new RejectSignupCommand(transactions, clock),
    },
    plans: {
      create: new CreatePlanCommand(repos.plans, clock),
      update: new UpdatePlanCommand(transactions, clock),
      list: new ListPlansQuery(repos.plans),
      listAll: new ListAllPlansQuery(repos.plans),
      get: new GetPlanQuery(repos.plans),
    },
    quotas: {
      overview: new GetQuotasOverviewQuery(repos.accounts, repos.users, clock),
      check: new CheckQuotaQuery(repos.users, repos.plans, repos.quotas, clock),
    },
    usage: {
      consume: new ConsumeUnitsCommand(transactions, clock),
      list: new ListUsageQuery(repos.usage),
      get: new GetUsageRecordQuery(repos.usage),
      accountSummary: accountUsageSummary,
      userSummary: userUsageSummary,
      adminAnalytics,
    },
    ai: {
      ask: new AskAdvisorQuery(aiProvider, accountUsageSummary, adminAnalytics, clock),
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
