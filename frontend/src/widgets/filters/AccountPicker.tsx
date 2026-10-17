import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Building2, X } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useServices } from '@/providers/ServicesProvider';
import { queryKeys, staleTimes } from '@/utils/queryKeys';
import { Input } from '@/widgets/ui/Field';

/**
 * Operator filter: pick an account by typing part of its name (server-side search, 8 results)
 * instead of pasting a UUID. The selected account id goes into the list's query.
 */
export function AccountPicker({ value, onChange, label = 'Account' }: { value: string; onChange: (accountId: string) => void; label?: string }) {
  const { accounts } = useServices();
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const search = useDebouncedValue(text, 250);

  const params = { search: search || undefined, page: 1, pageSize: 8, sort: 'name' as const, order: 'asc' as const };
  const options = useQuery({
    queryKey: queryKeys.admin.accounts(params),
    queryFn: () => accounts.listAccounts(params),
    enabled: open,
    staleTime: staleTimes.accounts,
    placeholderData: keepPreviousData,
  });
  const selected = useQuery({
    queryKey: ['admin', 'account-name', value],
    queryFn: () => accounts.getAccount(value),
    enabled: Boolean(value),
    staleTime: staleTimes.accounts,
  });

  if (value) {
    return (
      <div className="space-y-1">
        <span className="block text-xs font-medium text-slate-600">{label}</span>
        <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm text-brand-800">
          <span className="flex min-w-0 items-center gap-1.5">
            <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{selected.data?.name ?? 'Loading…'}</span>
          </span>
          <button type="button" onClick={() => onChange('')} className="rounded p-0.5 hover:bg-brand-100" aria-label="Clear account filter">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">
        {label}
      </label>
      <Input
        id={id}
        className="h-9"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        placeholder="Type to search accounts"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-surface py-1 text-sm shadow-lg">
          {options.data?.items.length === 0 && <li className="px-3 py-2 text-slate-500">No accounts match</li>}
          {!options.data && <li className="px-3 py-2 text-slate-500">Loading…</li>}
          {options.data?.items.map((account) => (
            <li
              key={account.id}
              role="option"
              aria-selected={false}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(account.id);
                setText('');
                setOpen(false);
              }}
              className="cursor-pointer px-3 py-2 hover:bg-slate-50"
            >
              <span className="block font-medium text-slate-800">{account.name}</span>
              <span className="text-xs text-slate-500">
                {account.quota.planName} · {account.userCount} users
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
