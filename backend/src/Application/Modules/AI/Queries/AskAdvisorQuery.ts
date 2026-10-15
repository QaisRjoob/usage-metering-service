import { aiInsightSchema, type AiAdvisorRequest, type AiAdvisorResponse, type AiAdvisorScope } from '../../../../contracts';
import { AppError } from '../../../../Shared/Errors/AppError';
import type { AuthenticatedAccount } from '../../../../Domain/Accounts/Account';
import { periodOf } from '../../../../Domain/Quotas/QuotaPeriod';
import type { Clock } from '../../../Common/Clock';
import type { GetAdminAnalyticsQuery } from '../../Usage/Queries/GetAdminAnalyticsQuery';
import type { GetAccountUsageSummaryQuery } from '../../Usage/Queries/GetUsageSummaryQueries';
import type { AIProvider } from '../Interfaces/AIProvider';
import { buildAccountContext, buildGlobalContext } from '../Services/UsageContextBuilder';

/** Who is asking: an account (API key) sees only itself; the operator (admin token) sees all. */
export type AdvisorCaller = { kind: 'account'; account: AuthenticatedAccount } | { kind: 'admin' };

/**
 * POST /ai/advisor. Steps: scope from the credential -> aggregates from the existing queries ->
 * bounded, sanitized context -> provider -> validate the structured answer -> typed response.
 * The model cannot query the database, change quotas, or authorize anything.
 */
export class AskAdvisorQuery {
  constructor(
    private readonly provider: AIProvider,
    private readonly accountSummary: GetAccountUsageSummaryQuery,
    private readonly adminAnalytics: GetAdminAnalyticsQuery,
    private readonly clock: Clock,
  ) {}

  async execute(caller: AdvisorCaller, request: AiAdvisorRequest): Promise<AiAdvisorResponse> {
    const period = request.month ?? periodOf(this.clock.now());
    const built =
      caller.kind === 'account'
        ? buildAccountContext(caller.account.name, await this.accountSummary.execute(caller.account.id, period))
        : buildGlobalContext(await this.adminAnalytics.execute(period));
    const scope: AiAdvisorScope = {
      kind: caller.kind === 'account' ? 'account' : 'global',
      accountId: caller.kind === 'account' ? caller.account.id : null,
      accountName: caller.kind === 'account' ? caller.account.name : null,
      period,
      dataPoints: built.dataPoints,
    };

    let result;
    try {
      result = await this.provider.generateUsageInsight({ question: request.question, scope, context: built.context });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('AI_PROVIDER_ERROR', 'The AI provider failed to answer. Try again later.');
    }

    // Never trust provider output blindly: it must match the documented structure.
    const insight = aiInsightSchema.safeParse(result.insight);
    if (!insight.success) throw new AppError('AI_PROVIDER_ERROR', 'The AI provider returned an answer in an unexpected format.');

    return {
      question: request.question,
      answer: insight.data,
      scope,
      provider: result.provider,
      model: result.model,
      isMock: result.provider === 'mock',
      dataCompleteness: built.complete ? 'complete' : 'partial',
      generatedAt: this.clock.now().toISOString(),
    };
  }
}
