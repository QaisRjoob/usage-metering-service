/**
 * MOCK AI ADAPTER - deterministic, rule-based answers built from mock aggregates.
 * Responses are labelled `provider: 'mock'` / `isMock: true`. No model is called.
 */
import { aiAdvisorRequestSchema, type AiAdvisorResponse, type AiInsight } from '@/contracts';
import type { AiAdvisorService } from '@/services/aiAdvisorService';
import { formatPercent, formatUnits } from '@/utils/numberUtils';
import type { MockDatabase } from './mockDatabase';
import { requireAccount, requireAdmin, simulate, validate } from './mockRuntime';

type Topic = 'closest' | 'trend' | 'unusual' | 'users' | 'rejections' | 'summary';

function topicOf(question: string): Topic {
  const text = question.toLowerCase();
  if (text.includes('user') && (text.includes('closest') || text.includes('individual'))) return 'users';
  if (text.includes('closest') || text.includes('exhaust')) return 'closest';
  if (text.includes('reject') || text.includes('why')) return 'rejections';
  if (text.includes('unusual') || text.includes('spike') || text.includes('high usage')) return 'unusual';
  if (text.includes('change') || text.includes('trend') || text.includes('over time')) return 'trend';
  return 'summary';
}

function globalInsight(db: MockDatabase, period: string, topic: Topic): { insight: AiInsight; dataPoints: number } {
  const summary = db.adminSummary(period);
  const top = summary.topAccounts;
  const highlights: AiInsight['highlights'] = [];
  if (topic === 'closest' || topic === 'summary' || topic === 'unusual') {
    for (const account of top.slice(0, 4)) {
      highlights.push({
        title: account.name,
        detail: `${formatUnits(account.quota.consumed)} of ${formatUnits(account.quota.monthlyAllowance)} units used (${formatPercent(account.quota.utilizationPercent)}) on ${account.quota.planName}.`,
        severity: account.quota.utilizationPercent >= 100 ? 'critical' : account.quota.utilizationPercent >= summary.thresholdPercent ? 'warning' : 'info',
      });
    }
  }
  if (topic === 'trend') {
    for (const point of summary.monthly.slice(-3)) {
      highlights.push({ title: point.period, detail: `${formatUnits(point.unitsConsumed)} units consumed, ${point.rejectedRequests} rejected requests.`, severity: 'info' });
    }
  }
  if (topic === 'rejections' || topic === 'users') {
    highlights.push({
      title: 'Rejected requests',
      detail: `${summary.totals.rejectedRequests} of ${summary.totals.acceptedRequests + summary.totals.rejectedRequests} requests were rejected this month. Ask with an account API key for a per-rule breakdown.`,
      severity: summary.totals.rejectedRequests > 0 ? 'warning' : 'info',
    });
  }
  return {
    dataPoints: summary.topAccounts.length + summary.monthly.length + summary.daily.length,
    insight: {
      summary: `Across ${summary.totals.accounts} accounts, ${formatUnits(summary.totals.unitsConsumed)} of ${formatUnits(summary.totals.totalAllowance)} allocated units (${formatPercent(summary.totals.utilizationPercent)}) were used in ${period}. ${summary.totals.accountsApproachingLimit} accounts are approaching their limit and ${summary.totals.accountsAtOrOverLimit} are at or over it.`,
      highlights,
      recommendations: [
        'Contact accounts above 80% utilization before they are rejected by the shared monthly allowance.',
        'Consider moving consistently exhausted accounts to a larger plan; switching keeps units already consumed.',
      ],
    },
  };
}

function accountInsight(db: MockDatabase, accountId: string, period: string, topic: Topic): { insight: AiInsight; dataPoints: number } {
  const account = db.getAccount(accountId);
  const summary = db.accountUsageSummary(account, period);
  const highlights: AiInsight['highlights'] = [];
  if (topic === 'rejections') {
    for (const item of summary.rejectionsByRule) {
      highlights.push({ title: `${item.rule} (${item.level})`, detail: `${item.count} requests rejected by the ${item.level}-level ${item.rule} rule.`, severity: 'warning' });
    }
  } else {
    for (const user of summary.topUsers.slice(0, 4)) {
      highlights.push({
        title: user.externalUserId,
        detail: `${formatUnits(user.quota.consumed)} of ${formatUnits(user.quota.monthlyAllowance)} individual units (${formatPercent(user.quota.utilizationPercent)}) on ${user.quota.planName}.`,
        severity: user.quota.utilizationPercent >= 100 ? 'critical' : user.quota.utilizationPercent >= 80 ? 'warning' : 'info',
      });
    }
  }
  return {
    dataPoints: summary.topUsers.length + summary.daily.length + summary.rejectionsByRule.length,
    insight: {
      summary: `${account.name} used ${formatUnits(summary.account.consumed)} of its ${formatUnits(summary.account.monthlyAllowance)} shared units (${formatPercent(summary.account.utilizationPercent)}) in ${period}, with ${summary.requests.accepted} accepted and ${summary.requests.rejected} rejected requests.`,
      highlights,
      recommendations:
        summary.account.remaining === 0
          ? ['The shared allowance is exhausted: every further request is rejected at the account level until the plan is raised or the month ends.']
          : ['Users on Basic hit the 20-unit per-request limit first; move heavy users to Premium if that is expected.'],
    },
  };
}

export function createMockAiAdvisorService(): AiAdvisorService {
  return {
    ask: (request, scope) =>
      simulate((db): AiAdvisorResponse => {
        const input = validate(aiAdvisorRequestSchema, request);
        const period = input.month ?? db.currentPeriod();
        const topic = topicOf(input.question);
        let result: { insight: AiInsight; dataPoints: number };
        let accountId: string | null = null;
        let accountName: string | null = null;
        if (scope === 'global') {
          requireAdmin();
          result = globalInsight(db, period, topic);
        } else {
          const account = requireAccount(db);
          accountId = account.id;
          accountName = account.name;
          result = accountInsight(db, account.id, period, topic);
        }
        return {
          question: input.question,
          answer: result.insight,
          scope: { kind: scope, accountId, accountName, period, dataPoints: result.dataPoints },
          provider: 'mock',
          model: null,
          isMock: true,
          dataCompleteness: 'complete',
          generatedAt: db.now().toISOString(),
        };
      }),
  };
}
