import { useState, type FormEvent } from 'react';
import type { UsageFiltersValue } from '@/view_models/useUsageHistoryViewModel';
import { formatMonthLabel, recentMonths } from '@/utils/dateUtils';
import { optionalText } from '@/utils/validationUtils';
import { Button } from '@/widgets/ui/Button';
import { Field, Input, Select } from '@/widgets/ui/Field';

interface UsageFiltersProps {
  value: UsageFiltersValue;
  showAccountFilter: boolean;
  rangeError: string | null;
  onApply: (value: UsageFiltersValue) => void;
  onClear: () => void;
}

/** Draft filters are applied together, so typing does not fire a request per keystroke. */
export function UsageFilters({ value, showAccountFilter, rangeError, onApply, onClear }: UsageFiltersProps) {
  const [draft, setDraft] = useState<UsageFiltersValue>(value);
  const update = (patch: Partial<UsageFiltersValue>) => setDraft((current) => ({ ...current, ...patch }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onApply({
      ...draft,
      accountId: optionalText(draft.accountId ?? ''),
      userId: optionalText(draft.userId ?? ''),
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      {showAccountFilter && (
        <Field label="Account id">
          {(props) => <Input {...props} className="h-9" placeholder="UUID" value={draft.accountId ?? ''} onChange={(event) => update({ accountId: event.target.value })} />}
        </Field>
      )}
      <Field label="User id">
        {(props) => <Input {...props} className="h-9" placeholder="e.g. alice" value={draft.userId ?? ''} onChange={(event) => update({ userId: event.target.value })} />}
      </Field>
      <Field label="Outcome">
        {(props) => (
          <Select {...props} className="h-9" value={draft.outcome ?? ''} onChange={(event) => update({ outcome: (event.target.value || undefined) as UsageFiltersValue['outcome'] })}>
            <option value="">All</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </Select>
        )}
      </Field>
      <Field label="Month (UTC)">
        {(props) => (
          <Select {...props} className="h-9" value={draft.month ?? ''} onChange={(event) => update({ month: event.target.value || undefined })}>
            <option value="">Any month</option>
            {recentMonths(12).map((month) => (
              <option key={month} value={month}>
                {formatMonthLabel(month)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="From (UTC date)" error={rangeError ?? undefined}>
        {(props) => <Input {...props} className="h-9" type="date" value={draft.from ?? ''} onChange={(event) => update({ from: event.target.value || undefined })} />}
      </Field>
      <Field label="To (UTC date)">
        {(props) => <Input {...props} className="h-9" type="date" value={draft.to ?? ''} onChange={(event) => update({ to: event.target.value || undefined })} />}
      </Field>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-6 lg:justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft({});
            onClear();
          }}
        >
          Clear
        </Button>
        <Button type="submit" size="sm">
          Apply filters
        </Button>
      </div>
    </form>
  );
}
