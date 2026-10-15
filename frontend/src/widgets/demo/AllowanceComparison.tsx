import type { ConsumeDecision } from '@/models/consumption';
import { QuotaSnapshotCard } from '@/widgets/quotas/QuotaSnapshotCard';

/** Account (shared) and user (individual) allowances side by side, after the decision. */
export function AllowanceComparison({ decision }: { decision: ConsumeDecision }) {
  const rejectedLevel = decision.rejection?.level;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <QuotaSnapshotCard quota={decision.account} title="Account remaining (shared)" highlight={rejectedLevel === 'account'} />
      <QuotaSnapshotCard quota={decision.user} title={`User remaining (${decision.userId})`} highlight={rejectedLevel === 'user'} />
    </div>
  );
}
