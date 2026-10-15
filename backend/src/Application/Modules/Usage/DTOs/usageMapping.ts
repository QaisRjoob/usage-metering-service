import type { DailyUsagePoint } from '../../../../contracts';
import { daysInPeriod, periodOf, type QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';

/** One point per UTC day of the period (up to today for the current month), zero-filled. */
export function fillDailySeries(points: DailyUsagePoint[], period: QuotaPeriod, now: Date): DailyUsagePoint[] {
  const byDate = new Map(points.map((point) => [point.date, point]));
  const lastDay = period === periodOf(now) ? now.getUTCDate() : daysInPeriod(period);
  return Array.from({ length: lastDay }, (_, index) => {
    const date = `${period}-${String(index + 1).padStart(2, '0')}`;
    return byDate.get(date) ?? { date, unitsConsumed: 0, acceptedRequests: 0, rejectedRequests: 0 };
  });
}
