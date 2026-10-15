import { createHttpAccountService, type AccountService } from './accountService';
import { createHttpAiAdvisorService, type AiAdvisorService } from './aiAdvisorService';
import { createHttpAnalyticsService, type AnalyticsService } from './analyticsService';
import { apiConfig, type DataSource } from './api/apiConfig';
import { createMockAccountService } from './mock/mockAccountService';
import { createMockAiAdvisorService } from './mock/mockAiAdvisorService';
import { createMockAnalyticsService } from './mock/mockAnalyticsService';
import { createMockPlanService } from './mock/mockPlanService';
import { createMockQuotaService } from './mock/mockQuotaService';
import { createMockUsageService } from './mock/mockUsageService';
import { createMockUserService } from './mock/mockUserService';
import { createHttpPlanService, type PlanService } from './planService';
import { createHttpQuotaService, type QuotaService } from './quotaService';
import { createHttpUsageService, type UsageService } from './usageService';
import { createHttpUserService, type UserService } from './userService';

/** Every service the views use. Mock and HTTP implementations share these interfaces. */
export interface Services {
  dataSource: DataSource;
  accounts: AccountService;
  users: UserService;
  plans: PlanService;
  quotas: QuotaService;
  usage: UsageService;
  analytics: AnalyticsService;
  ai: AiAdvisorService;
}

export function createServices(dataSource: DataSource = apiConfig.dataSource): Services {
  if (dataSource === 'mock') {
    return {
      dataSource,
      accounts: createMockAccountService(),
      users: createMockUserService(),
      plans: createMockPlanService(),
      quotas: createMockQuotaService(),
      usage: createMockUsageService(),
      analytics: createMockAnalyticsService(),
      ai: createMockAiAdvisorService(),
    };
  }
  return {
    dataSource,
    accounts: createHttpAccountService(),
    users: createHttpUserService(),
    plans: createHttpPlanService(),
    quotas: createHttpQuotaService(),
    usage: createHttpUsageService(),
    analytics: createHttpAnalyticsService(),
    ai: createHttpAiAdvisorService(),
  };
}
