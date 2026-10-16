import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Building2, Search, User } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useServices } from '@/providers/ServicesProvider';
import { buildAccountDetailsPath } from '@/routing/routePaths';
import { cn, pluralize } from '@/utils/formatUtils';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

interface FinderOption {
  key: string;
  kind: 'company' | 'user';
  title: string;
  detail: string;
  accountId: string;
}

/**
 * Operator header search: type a company name, account id, API key prefix, or a user id / name and
 * jump straight to the company. Results come from GET /admin/search (best matches first).
 */
export function OperatorFinder() {
  const { directory } = useServices();
  const navigate = useNavigate();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = useDebouncedValue(text.trim(), 200);

  const results = useQuery({
    queryKey: queryKeys.admin.search(query),
    queryFn: () => directory.search(query),
    enabled: open && query.length > 0,
    staleTime: staleTimes.accounts,
    placeholderData: keepPreviousData,
  });

  const options: FinderOption[] = query
    ? [
        ...(results.data?.accounts ?? []).map((account) => ({
          key: `a-${account.id}`,
          kind: 'company' as const,
          title: account.name,
          detail: `${account.planName} · ${pluralize(account.userCount, 'user')} · ${account.apiKeyPrefix}…`,
          accountId: account.id,
        })),
        ...(results.data?.users ?? []).map((user) => ({
          key: `u-${user.id}`,
          kind: 'user' as const,
          title: user.displayName ? `${user.externalUserId} (${user.displayName})` : user.externalUserId,
          detail: `User of ${user.accountName}`,
          accountId: user.accountId,
        })),
      ]
    : [];

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (option: FinderOption) => {
    navigate(buildAccountDetailsPath(option.accountId));
    setText('');
    setOpen(false);
  };

  const showList = open && query.length > 0;
  const activeOption = options[active];

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        role="combobox"
        aria-label="Find a company or user"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && activeOption ? `${listId}-${activeOption.key}` : undefined}
        placeholder="Find company or user…"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && activeOption) {
            event.preventDefault();
            choose(activeOption);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-8 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 focus:outline-none"
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label="Search results" className="absolute top-full right-0 left-0 z-40 mt-1 max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">{results.isFetching ? 'Searching…' : 'No company or user matches.'}</li>
          ) : (
            options.map((option, index) => {
              const Icon = option.kind === 'company' ? Building2 : User;
              return (
                <li
                  key={option.key}
                  id={`${listId}-${option.key}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  className={cn('flex cursor-pointer items-center gap-2.5 px-3 py-2', index === active && 'bg-brand-50')}
                >
                  <Icon className={cn('size-4 shrink-0', option.kind === 'company' ? 'text-brand-600' : 'text-slate-400')} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{option.title}</span>
                    <span className="block truncate text-xs text-slate-500">{option.detail}</span>
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
