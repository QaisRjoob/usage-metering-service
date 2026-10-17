import { QUOTA_STATUSES, STATUS_LABELS, type QuotaStatus } from '@/models/quota';
import { formatMonthLabel, recentMonths } from '@/utils/dateUtils';
import { buildChips, countActive } from '@/widgets/filters/chips';
import { FilterBar } from '@/widgets/filters/FilterBar';
import { DateRangeFilter, RangeFilter, SegmentedFilter, SelectFilter } from '@/widgets/filters/FilterFields';

interface UserListControls {
  filters: Record<string, string>;
  errors: Record<string, string>;
  set: (updates: Record<string, string | number | null | undefined>) => void;
  clearAll: () => void;
}

/**
 * The same user filters everywhere users are listed (operator account details, account Users,
 * Quotas): search, quota status, plan, utilization range, activity, rejections, registration date
 * and, where it applies, the month. With `categories`, status / activity / plan are picked in a
 * UserCategoryPanel above, so they are left out here.
 */
export function UserFilterBar({
  list,
  planOptions,
  planName,
  showMonth,
  categories = false,
  totalItems,
  isFetching,
}: {
  categories?: boolean;
  list: UserListControls;
  planOptions: { value: string; label: string }[];
  planName: (planId: string) => string;
  showMonth: boolean;
  totalItems?: number;
  isFetching: boolean;
}) {
  const f = list.filters;
  const advancedKeys = [...(categories ? [] : ['planId', 'activity']), 'hasRejections', 'minUtilization', 'maxUtilization', 'createdFrom', 'createdTo', ...(showMonth ? ['month'] : [])];
  return (
    <FilterBar
      search={{ value: f.search ?? '', onChange: (value) => list.set({ search: value }), placeholder: 'Search by user id or name', label: 'Search users' }}
      quick={
        categories ? undefined : (
        <SegmentedFilter
          label="Quota status"
          value={(f.status as QuotaStatus | undefined) ?? ''}
          onChange={(value) => list.set({ status: value })}
          options={[{ value: '', label: 'All' }, ...QUOTA_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }))]}
        />
        )
      }
      advancedActiveCount={countActive(f, advancedKeys)}
      advanced={
        <>
          {!categories && (
            <>
              <SelectFilter label="User plan" value={f.planId ?? ''} onChange={(value) => list.set({ planId: value })} options={planOptions} allLabel="Any plan" />
              <SelectFilter
                label="Activity this month"
                value={f.activity ?? ''}
                onChange={(value) => list.set({ activity: value })}
                options={[
                  { value: 'active', label: 'Active (made requests)' },
                  { value: 'inactive', label: 'No requests' },
                ]}
                allLabel="Any"
              />
            </>
          )}
          <SelectFilter
            label="Rejections this month"
            value={f.hasRejections ?? ''}
            onChange={(value) => list.set({ hasRejections: value })}
            options={[
              { value: 'true', label: 'At least one rejection' },
              { value: 'false', label: 'No rejections' },
            ]}
            allLabel="Any"
          />
          <RangeFilter
            label="Utilization"
            unit="%"
            min={f.minUtilization ?? ''}
            max={f.maxUtilization ?? ''}
            onChange={(min, max) => list.set({ minUtilization: min, maxUtilization: max })}
            error={list.errors.minUtilization ?? list.errors.maxUtilization}
          />
          <DateRangeFilter
            label="Registered"
            from={f.createdFrom ?? ''}
            to={f.createdTo ?? ''}
            onChange={(from, to) => list.set({ createdFrom: from, createdTo: to })}
            error={list.errors.createdFrom ?? list.errors.createdTo}
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
          { key: 'activity', label: 'Activity' },
          { key: 'planId', label: 'Plan', format: planName },
          { key: 'hasRejections', label: 'Rejections', format: (value) => (value === 'true' ? 'some this month' : 'none this month') },
          { key: 'createdFrom', label: 'Registered from' },
          { key: 'createdTo', label: 'Registered to' },
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
