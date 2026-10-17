import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import type { RuleViolation } from '@/models/quota';
import { LEVEL_LABELS, RULE_LABELS } from '@/models/quota';
import { cn } from '@/utils/formatUtils';
import { formatUnits } from '@/utils/numberUtils';
import { Badge } from '@/widgets/ui/Badge';

interface DecisionCardProps {
  accepted: boolean;
  rejection: RuleViolation | null;
  violations: RuleViolation[];
  units: number;
  userId: string;
  requestId?: string;
  idempotentReplay?: boolean;
  dryRun?: boolean;
}

/** Explains a decision: accepted, or which rule rejected it and whether it is an account or user rule. */
export function DecisionCard({ accepted, rejection, violations, units, userId, requestId, idempotentReplay = false, dryRun = false }: DecisionCardProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('rounded-xl border p-4', accepted ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50')}
    >
      <div className="flex flex-wrap items-center gap-2">
        {accepted ? <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" /> : <XCircle className="size-5 text-rose-600" aria-hidden="true" />}
        <p className={cn('text-sm font-semibold', accepted ? 'text-emerald-900' : 'text-rose-900')}>
          {dryRun ? (accepted ? 'Would be accepted' : 'Would be rejected') : accepted ? 'Accepted' : 'Rejected'} · {formatUnits(units)} units for{' '}
          <span className="font-mono">{userId}</span>
        </p>
        {dryRun && <Badge tone="info">Dry run · nothing consumed</Badge>}
        {idempotentReplay && (
          <Badge tone="info">
            <RotateCcw className="size-3" aria-hidden="true" /> Idempotent replay · nothing consumed again
          </Badge>
        )}
      </div>
      {rejection && (
        <div className="mt-3 rounded-lg bg-surface/70 p-3 text-sm">
          <p className="font-medium text-rose-900">
            {RULE_LABELS[rejection.rule]} <span className="font-mono text-xs">({rejection.rule})</span>
          </p>
          <p className="mt-0.5 text-rose-800">
            Rule level: <strong>{LEVEL_LABELS[rejection.level]}</strong>
          </p>
          <p className="mt-1 text-rose-700">{rejection.message}</p>
          {!accepted && !dryRun && <p className="mt-1 text-xs text-rose-600">A rejection consumes nothing.</p>}
        </div>
      )}
      {violations.length > 1 && (
        <details className="mt-2 text-xs text-rose-800">
          <summary className="cursor-pointer">All failing rules ({violations.length}), in evaluation order</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {violations.map((violation) => (
              <li key={`${violation.rule}-${violation.level}`}>
                {violation.rule} · {violation.level}: {violation.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {requestId && <p className="mt-2 font-mono text-[11px] text-slate-500">requestId: {requestId}</p>}
    </div>
  );
}
