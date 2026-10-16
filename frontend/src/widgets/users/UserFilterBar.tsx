import { QUOTA_STATUSES, STATUS_LABELS, type QuotaStatus } from '@/models/quota';
import { formatMonthLabel, recentMonths } from '@/utils/dateUtils';
import { buildChips, countActive } from '@/widgets/filters/chips';
import { FilterBar } from '@/widgets/filters/FilterBar';
import { RangeFilter, SegmentedFilter, SelectFilter } from '@/widgets/filters/FilterFields';

interface UserListControls {
  filters: Record<string, string>;
  errors: Record<string, string>;
  set: (updates: Record<string, string | number | null | undefined>) => void;
  clearAll: () => void;
}

/**
 * The same user filters everywhere users are listed (operator account details, account Users,
 * Quotas): search, quota status, plan, utilization range and, where it applies, the month.
 */
export function UserFilterBar({
  list,
  planOptions,
  planName,
  showMonth,
  totalItems,
  isFetching,
}: {
  list: UserListControls;
  planOptions: { value: string; label: string }[];
  planName: (planId: string) => string;
  showMonth: boolean;
  totalItems?: number;
  isFetching: boolean;
}) {
  const f = list.filters;
  const advancedKeys = ['planId', 'minUtilization', 'maxUtilization', ...(showMonth ? ['month'] : [])];
  return (
    <FilterBar
      search={{ value: f.search ?? '', onChange: (value) => list.set({ search: value }), placeholder: 'Search by user id or name', label: 'Search users' }}
      quick={
        <SegmentedFilter
          label="Quota status"
          value={(f.status as QuotaStatus | undefined) ?? ''}
          onChange={(value) => list.set({ status: value })}
          options={[{ value: '', label: 'All' }, ...QUOTA_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }))]}
        />
      }
      advancedActiveCount={countActive(f, advancedKeys)}
      advanced={
        <>
          <SelectFilter label="User plan" value={f.planId ?? ''} onChange={(value) => list.set({ planId: value })} options={planOptions} allLabel="Any plan" />
          <RangeFilter
            label="Utilization"
            unit="%"
            min={f.minUtilization ?? ''}
            max={f.maxUtilization ?? ''}
            onChange={(min, max) => list.set({ minUtilization: min, maxUtilization: max })}
            error={list.errors.minUtilization ?? list.errors.maxUtilization}
          />
          {showMonth && (
            <SelectFilter
              label="Month (UTC)"
              value={f.month ?? ''}
              onChange={(value) => list.set({ month: value })}
              options={recentMonths(12).map((month) => ({ value: month, label: formatMonthLabel(month) }))}
              allLabel="Current month"
            />
          )}
        </>
      }
      chips={buildChips(
        f,
        [
          { key: 'search', label: 'Search' },
          { key: 'status', label: 'Status', format: (value) => STATUS_LABELS[value as QuotaStatus] ?? value },
          { key: 'planId', label: 'Plan', format: planName },
          { range: ['minUtilization', 'maxUtilization'], label: 'Utilization', unit: '%' },
          { key: 'month', label: 'Month', format: formatMonthLabel },
        ],
        list.set,
      )}
      onClearAll={list.clearAll}
      totalItems={totalItems}
      isFetching={isFetching}
    />
  );
}
