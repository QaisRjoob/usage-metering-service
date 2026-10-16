import { LEVEL_LABELS, RULE_LABELS, type RuleCode, type RuleLevel } from '@/models/quota';
import { formatMonthLabel, recentMonths } from '@/utils/dateUtils';
import { AccountPicker } from '@/widgets/filters/AccountPicker';
import { buildChips, countActive } from '@/widgets/filters/chips';
import { FilterBar } from '@/widgets/filters/FilterBar';
import { DateRangeFilter, RangeFilter, SegmentedFilter, SelectFilter, TextFilter } from '@/widgets/filters/FilterFields';
import { Select } from '@/widgets/ui/Field';

interface HistoryListControls {
  filters: Record<string, string>;
  errors: Record<string, string>;
  sort?: string;
  order?: string;
  set: (updates: Record<string, string | number | null | undefined>) => void;
  clearAll: () => void;
}

const ADVANCED = ['accountId', 'userId', 'rule', 'level', 'minUnits', 'maxUnits', 'requestId', 'replayed', 'month', 'from', 'to'];

/** Filters for request history. Every one maps 1:1 to a field of the usage query DTO. */
export function UsageFilters({ list, showAccountFilter, totalItems, isFetching }: { list: HistoryListControls; showAccountFilter: boolean; totalItems?: number; isFetching: boolean }) {
  const f = list.filters;
  const rejectedOnly = f.outcome === 'rejected';

  // Picking a rejection reason only makes sense for rejected requests, so it narrows the outcome too.
  const setRejection = (updates: Record<string, string>) => list.set({ ...updates, ...(Object.values(updates).some(Boolean) ? { outcome: 'rejected' } : {}) });

  return (
    <FilterBar
      quick={
        <>
          <SegmentedFilter
            label="Outcome"
            value={(f.outcome as 'accepted' | 'rejected' | undefined) ?? ''}
            onChange={(value) => list.set({ outcome: value, ...(value !== 'rejected' ? { rule: null, level: null } : {}) })}
            options={[
              { value: '', label: 'All requests' },
              { value: 'accepted', label: 'Accepted' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
          <SegmentedFilter
            label="Rejected by"
            value={(f.level as RuleLevel | undefined) ?? ''}
            onChange={(value) => setRejection({ level: value })}
            options={[
              { value: '', label: rejectedOnly ? 'Any level' : 'Any' },
              { value: 'user', label: 'User limit' },
              { value: 'account', label: 'Account limit' },
            ]}
          />
        </>
      }
      trailing={
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          Sort
          <Select
            className="h-9 w-44"
            value={`${list.sort ?? 'createdAt'}:${list.order ?? 'desc'}`}
            onChange={(event) => {
              const [sort, order] = event.target.value.split(':');
              list.set({ sort, order });
            }}
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="units:desc">Most units first</option>
            <option value="units:asc">Fewest units first</option>
          </Select>
        </label>
      }
      advancedActiveCount={countActive(f, ADVANCED)}
      advanced={
        <>
          {showAccountFilter && <AccountPicker value={f.accountId ?? ''} onChange={(value) => list.set({ accountId: value })} />}
          <TextFilter label="User id (exact)" value={f.userId ?? ''} onChange={(value) => list.set({ userId: value })} placeholder="e.g. alice" error={list.errors.userId} />
          <SelectFilter
            label="Rejection rule"
            value={f.rule ?? ''}
            onChange={(value) => setRejection({ rule: value })}
            options={(Object.keys(RULE_LABELS) as RuleCode[]).map((rule) => ({ value: rule, label: RULE_LABELS[rule] }))}
            allLabel="Any rule"
          />
          <RangeFilter
            label="Units requested"
            min={f.minUnits ?? ''}
            max={f.maxUnits ?? ''}
            onChange={(min, max) => list.set({ minUnits: min, maxUnits: max })}
            error={list.errors.minUnits ?? list.errors.maxUnits}
          />
          <TextFilter label="Request id contains" value={f.requestId ?? ''} onChange={(value) => list.set({ requestId: value })} placeholder="e.g. doc_" />
          <SelectFilter
            label="Retried (idempotent replay)"
            value={f.replayed ?? ''}
            onChange={(value) => list.set({ replayed: value })}
            options={[
              { value: 'true', label: 'Replayed at least once' },
              { value: 'false', label: 'Never replayed' },
            ]}
            allLabel="Either"
          />
          <SelectFilter
            label="Month (UTC)"
            value={f.month ?? ''}
            onChange={(value) => list.set({ month: value })}
            options={recentMonths(12).map((month) => ({ value: month, label: formatMonthLabel(month) }))}
            allLabel="Any month"
          />
          <DateRangeFilter label="Date" from={f.from ?? ''} to={f.to ?? ''} onChange={(from, to) => list.set({ from, to })} error={list.errors.from ?? list.errors.to} />
        </>
      }
      chips={buildChips(
        f,
        [
          { key: 'accountId', label: 'Account', format: () => 'selected account' },
          { key: 'outcome', label: 'Outcome' },
          { key: 'level', label: 'Rejected by', format: (value) => LEVEL_LABELS[value as RuleLevel] ?? value },
          { key: 'rule', label: 'Rule', format: (value) => RULE_LABELS[value as RuleCode] ?? value },
          { key: 'userId', label: 'User' },
          { range: ['minUnits', 'maxUnits'], label: 'Units' },
          { key: 'requestId', label: 'Request id' },
          { key: 'replayed', label: 'Replayed', format: (value) => (value === 'true' ? 'yes' : 'no') },
          { key: 'month', label: 'Month', format: formatMonthLabel },
          { key: 'from', label: 'From' },
          { key: 'to', label: 'To' },
        ],
        list.set,
      )}
      onClearAll={list.clearAll}
      totalItems={totalItems}
      isFetching={isFetching}
    />
  );
}
