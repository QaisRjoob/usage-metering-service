import type { ActivitySummary } from '@/models/directory';
import { formatRelativeTime, formatUtcDateTime } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';

/** "12 ok · 3 rejected" for the selected month. */
export function RequestCountsCell({ activity }: { activity: ActivitySummary }) {
  if (activity.acceptedRequests + activity.rejectedRequests === 0) return <span className="text-xs text-slate-400">None</span>;
  return (
    <span className="whitespace-nowrap text-xs tabular-nums">
      <span className="text-emerald-700">{formatUnits(activity.acceptedRequests)} ok</span>
      <span className="text-slate-300"> · </span>
      <span className={activity.rejectedRequests > 0 ? 'font-medium text-rose-700' : 'text-slate-400'}>{formatUnits(activity.rejectedRequests)} rejected</span>
    </span>
  );
}

/** Relative time of the latest request, with the exact UTC time as a tooltip. */
export function LastActivityCell({ lastRequestAt }: { lastRequestAt: string | null }) {
  if (!lastRequestAt) return <span className="text-xs text-slate-400">Never</span>;
  return (
    <time dateTime={lastRequestAt} title={formatUtcDateTime(lastRequestAt)} className="whitespace-nowrap text-xs text-slate-600">
      {formatRelativeTime(lastRequestAt)}
    </time>
  );
}

