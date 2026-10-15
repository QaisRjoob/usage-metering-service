import type { UsageOutcome } from '@/models/usage-record';
import type { RuleCode, RuleLevel } from '@/models/quota';
import { LEVEL_LABELS, RULE_LABELS } from '@/models/quota';
import { Badge } from '@/widgets/ui/Badge';

export function OutcomeBadge({ outcome }: { outcome: UsageOutcome }) {
  return outcome === 'accepted' ? <Badge tone="success">Accepted</Badge> : <Badge tone="danger">Rejected</Badge>;
}

export function RuleCell({ rule, level }: { rule: RuleCode | null; level: RuleLevel | null }) {
  if (!rule || !level) return <span className="text-slate-400">—</span>;
  return (
    <div className="leading-tight">
      <span className="block font-mono text-xs text-slate-800">{rule}</span>
      <span className="text-xs text-slate-500" title={RULE_LABELS[rule]}>
        {LEVEL_LABELS[level]}
      </span>
    </div>
  );
}
