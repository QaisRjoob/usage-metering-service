import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import type { AiAdvisorResponse, AiSeverity } from '@/models/ai-advisor';
import { formatMonthLabel, formatUtcDateTime } from '@/utils/dateUtils';
import { cn } from '@/utils/formatUtils';
import { Badge } from '@/widgets/ui/Badge';

const severityStyle: Record<AiSeverity, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'border-sky-200 bg-sky-50 text-sky-900' },
  warning: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-900' },
  critical: { icon: OctagonAlert, className: 'border-rose-200 bg-rose-50 text-rose-900' },
};

export function AiResponsePanel({ response }: { response: AiAdvisorResponse }) {
  const { answer, scope } = response;
  return (
    <div className="space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {response.isMock ? <Badge tone="warning">Mock response — no AI model was called</Badge> : <Badge tone="brand">OpenAI · {response.model}</Badge>}
        <Badge tone="neutral">{scope.kind === 'global' ? 'Scope: all accounts (operator)' : `Scope: ${scope.accountName ?? 'account'}`}</Badge>
        <Badge tone="neutral">Period: {formatMonthLabel(scope.period)} (UTC)</Badge>
        <Badge tone="neutral">{scope.dataPoints} aggregate rows</Badge>
        {response.dataCompleteness === 'partial' && <Badge tone="warning">Based on partial data</Badge>}
      </div>
      <p className="text-sm leading-relaxed text-slate-800">{answer.summary}</p>
      {answer.highlights.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {answer.highlights.map((highlight, index) => {
            const style = severityStyle[highlight.severity];
            return (
              <li key={`${highlight.title}-${index}`} className={cn('flex gap-2 rounded-lg border p-3 text-sm', style.className)}>
                <style.icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">{highlight.title}</p>
                  <p className="text-xs opacity-90">{highlight.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {answer.recommendations.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommendations</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {answer.recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-400">
        Numbers are calculated by the service; the advisor only explains them. Generated {formatUtcDateTime(response.generatedAt)}.
      </p>
    </div>
  );
}
