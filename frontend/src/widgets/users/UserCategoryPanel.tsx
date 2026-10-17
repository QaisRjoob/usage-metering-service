import type { UserFacets } from '@/models/directory';
import { QUOTA_STATUSES, STATUS_LABELS } from '@/models/quota';
import { planFacetLabel } from '@/utils/formatUtils';
import { CategoryGroup, CategoryPanel, CategoryTabs } from '@/widgets/filters/CategoryTabs';

/**
 * "Browse by category" for a list of users: quota status, activity this month and plan, each tab
 * with the server-side count. Used by the company portal's Users page and the operator's company page.
 */
export function UserCategoryPanel({
  facets,
  filters,
  set,
}: {
  facets: UserFacets | undefined;
  filters: Record<string, string>;
  set: (updates: Record<string, string | null>) => void;
}) {
  return (
    <CategoryPanel>
      <CategoryGroup title="Quota status">
        <CategoryTabs
          label="Quota status"
          value={filters.status ?? ''}
          onChange={(value) => set({ status: value })}
          options={[{ value: '', label: 'All', count: facets?.total }, ...QUOTA_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status], count: facets?.byStatus[status] }))]}
        />
      </CategoryGroup>
      <CategoryGroup title="Activity this month">
        <CategoryTabs
          label="Activity this month"
          value={filters.activity ?? ''}
          onChange={(value) => set({ activity: value })}
          options={[
            { value: '', label: 'All', count: facets?.total },
            { value: 'active', label: 'Active', count: facets?.byActivity.active },
            { value: 'inactive', label: 'No requests', count: facets?.byActivity.inactive },
          ]}
        />
      </CategoryGroup>
      <CategoryGroup title="User plan">
        <CategoryTabs
          label="User plan"
          value={filters.planId ?? ''}
          onChange={(value) => set({ planId: value })}
          options={[{ value: '', label: 'All plans', count: facets?.total }, ...(facets?.byPlan ?? []).map((plan) => ({ value: plan.planId, label: planFacetLabel(plan), count: plan.count }))]}
        />
      </CategoryGroup>
    </CategoryPanel>
  );
}
