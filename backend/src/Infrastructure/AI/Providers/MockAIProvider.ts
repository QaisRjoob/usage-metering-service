import type { AiInsight } from '../../../contracts';
import type { AIInsightInput, AIInsightResult, AIProvider } from '../../../Application/Modules/AI/Interfaces/AIProvider';

interface ListedItem {
  account?: string;
  user?: string;
  plan: string;
  consumed: number;
  monthlyAllowance: number;
  utilizationPercent: number;
  status: string;
}

const severityOf = (status: string): AiInsight['highlights'][number]['severity'] =>
  status === 'exhausted' || status === 'over_allowance' ? 'critical' : status === 'warning' ? 'warning' : 'info';

/**
 * Deterministic provider for development, tests and the default Docker Compose stack.
 * It never calls a model: it restates the service's own aggregates in the answer structure and is
 * always labelled `provider: "mock"`.
 */
export class MockAIProvider implements AIProvider {
  async generateUsageInsight(input: AIInsightInput): Promise<AIInsightResult> {
    const context = input.context as Record<string, unknown>;
    const items = (context.accountsClosestToTheirLimit ?? context.usersClosestToTheirLimit ?? []) as ListedItem[];
    const highlights = items.slice(0, 4).map((item) => ({
      title: item.account ?? item.user ?? 'item',
      detail: `${item.consumed} of ${item.monthlyAllowance} units used (${item.utilizationPercent}%) on ${item.plan}.`,
      severity: severityOf(item.status),
    }));
    const summary =
      input.scope.kind === 'global'
        ? `Mock answer for ${input.scope.period}: listing the accounts closest to their shared limits, computed by the service.`
        : `Mock answer for ${input.scope.accountName ?? 'this account'} in ${input.scope.period}: listing the users closest to their individual limits, computed by the service.`;
    return {
      provider: 'mock',
      model: null,
      insight: {
        summary,
        highlights,
        recommendations: ['Set AI_PROVIDER=openai with OPENAI_API_KEY and OPENAI_MODEL for natural-language answers.'],
      },
    };
  }
}
