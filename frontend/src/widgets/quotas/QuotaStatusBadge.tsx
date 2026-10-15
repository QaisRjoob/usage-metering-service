import type { QuotaStatus } from '@/models/quota';
import { STATUS_LABELS } from '@/models/quota';
import { Badge, type BadgeTone } from '@/widgets/ui/Badge';

const tones: Record<QuotaStatus, BadgeTone> = {
  ok: 'success',
  warning: 'warning',
  exhausted: 'danger',
  over_allowance: 'danger',
};

export function QuotaStatusBadge({ status }: { status: QuotaStatus | null | undefined }) {
  if (!status) return <Badge tone="neutral">Unknown</Badge>;
  return <Badge tone={tones[status]}>{STATUS_LABELS[status]}</Badge>;
}
