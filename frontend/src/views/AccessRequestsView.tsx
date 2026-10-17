import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Mail, X } from 'lucide-react';
import { PREDEFINED_PLAN_IDS, adminListSignupRequestsQuerySchema, type AdminSignupRequest, type SignupStatus } from '@/contracts';
import { useListQuery } from '@/hooks/useListQuery';
import { useServices } from '@/providers/ServicesProvider';
import { buildAccountDetailsPath } from '@/routing/routePaths';
import { describeError } from '@/services/api/apiErrors';
import { formatRelativeTime, formatUtcDateTime } from '@/utils/dateUtils';
import { queryKeys } from '@/utils/queryKeys';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { ErrorState } from '@/widgets/common/ErrorState';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { CategoryGroup, CategoryPanel, CategoryTabs } from '@/widgets/filters/CategoryTabs';
import { buildChips } from '@/widgets/filters/chips';
import { FilterBar } from '@/widgets/filters/FilterBar';
import { Badge, type BadgeTone } from '@/widgets/ui/Badge';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { Dialog } from '@/widgets/ui/Dialog';
import { Field, Select, Textarea } from '@/widgets/ui/Field';

const FIELDS = ['search', 'status'] as const;
const STATUS_LABEL: Record<SignupStatus, string> = { pending: 'Waiting', approved: 'Approved', rejected: 'Denied' };
const STATUS_TONE: Record<SignupStatus, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'danger' };
const ACCOUNT_PLANS = [
  { value: PREDEFINED_PLAN_IDS.starter, label: 'Starter' },
  { value: PREDEFINED_PLAN_IDS.pro, label: 'Pro' },
];

type Decision = { kind: 'approve' | 'reject'; request: AdminSignupRequest };

/** Operator: companies asking for an account. Approve (creates the account) or deny with a reason. */
export default function AccessRequestsView() {
  const { signup } = useServices();
  const queryClient = useQueryClient();
  const list = useListQuery(adminListSignupRequestsQuerySchema, FIELDS, { pageSize: 20, sort: 'submittedAt', order: 'desc' });
  const [decision, setDecision] = useState<Decision | null>(null);
  const f = list.filters;

  const requests = useQuery({
    queryKey: queryKeys.admin.signupRequests(list.query ?? {}),
    queryFn: () => signup.list(list.query!),
    enabled: list.isValid,
    placeholderData: keepPreviousData,
  });
  const counts = requests.data?.counts;

  const done = () => {
    setDecision(null);
    // Requests, the pending badge and (after an approval) the accounts lists change.
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
  };

  const columns: Column<AdminSignupRequest>[] = [
    {
      key: 'company',
      header: 'Company',
      sortKey: 'companyName',
      firstOrder: 'asc',
      cell: (row) => (
        <div className="min-w-0 max-w-xs">
          <p className="font-medium text-slate-900">{row.companyName}</p>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            {row.contactName} · <Mail className="size-3" aria-hidden="true" /> {row.contactEmail}
          </p>
          {row.useCase && (
            <p className="mt-0.5 truncate text-xs text-slate-400" title={row.useCase}>
              “{row.useCase}”
            </p>
          )}
        </div>
      ),
    },
    { key: 'plan', header: 'Plan requested', cell: (row) => row.requestedPlan.name, hideBelow: 'md' },
    {
      key: 'submitted',
      header: 'Sent',
      sortKey: 'submittedAt',
      cell: (row) => (
        <time dateTime={row.submittedAt} title={formatUtcDateTime(row.submittedAt)} className="text-xs whitespace-nowrap text-slate-600">
          {formatRelativeTime(row.submittedAt)}
        </time>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="space-y-1">
          <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
          {row.status === 'approved' && <p className="text-[11px] text-slate-400">{row.claimed ? 'Key collected' : 'Key not collected yet'}</p>}
        </div>
      ),
    },
    {
      key: 'decision',
      header: 'Decision',
      sortKey: 'decidedAt',
      cell: (row) =>
        row.status === 'pending' ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setDecision({ kind: 'approve', request: row })} aria-label={`Approve ${row.companyName}`}>
              <Check className="size-3.5" aria-hidden="true" /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDecision({ kind: 'reject', request: row })} aria-label={`Deny ${row.companyName}`}>
              <X className="size-3.5" aria-hidden="true" /> Deny
            </Button>
          </div>
        ) : (
          <div className="max-w-56 text-xs">
            {row.account ? (
              <Link to={buildAccountDetailsPath(row.account.id)} className="font-medium text-brand-700 hover:underline">
                Open account
              </Link>
            ) : null}
            {row.decisionNote && (
              <p className="truncate text-slate-500" title={row.decisionNote}>
                {row.decisionNote}
              </p>
            )}
            {row.decidedAt && <p className="text-slate-400">{formatRelativeTime(row.decidedAt)}</p>}
          </div>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Access requests"
        description="Companies that asked for an account on the sign-up page. Approving creates the account; the company then collects its API key with its claim code. Denying sends them your reason."
      />
      <Card>
        <CategoryPanel>
          <CategoryGroup title="Status">
            <CategoryTabs
              label="Request status"
              value={f.status ?? ''}
              onChange={(value) => list.set({ status: value })}
              options={[
                { value: '', label: 'All', count: counts?.total },
                { value: 'pending', label: 'Waiting', count: counts?.pending },
                { value: 'approved', label: 'Approved', count: counts?.approved },
                { value: 'rejected', label: 'Denied', count: counts?.rejected },
              ]}
            />
          </CategoryGroup>
        </CategoryPanel>
        <FilterBar
          search={{ value: f.search ?? '', onChange: (value) => list.set({ search: value }), placeholder: 'Company, contact name or email', label: 'Search requests' }}
          chips={buildChips(f, [{ key: 'search', label: 'Search' }, { key: 'status', label: 'Status', format: (value) => STATUS_LABEL[value as SignupStatus] ?? value }], list.set)}
          onClearAll={list.clearAll}
          totalItems={requests.data?.totalItems}
          isFetching={requests.isFetching}
        />
        {requests.error && !requests.data ? (
          <ErrorState className="m-4" error={requests.error} onRetry={() => void requests.refetch()} />
        ) : (
          <>
            <DataTable
              caption="Access requests"
              columns={columns}
              rows={requests.data?.items}
              getRowKey={(row) => row.id}
              isLoading={requests.isPending || requests.isFetching}
              sort={{ field: list.sort, order: list.order }}
              onSort={list.setSort}
              empty={
                <EmptyState
                  title={list.activeCount > 0 ? 'No requests match these filters' : 'No requests yet'}
                  description={list.activeCount > 0 ? 'Pick another status or clear the search.' : 'Requests sent from the sign-up page appear here.'}
                />
              }
            />
            {requests.data && <PaginationControls {...requests.data} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} isFetching={requests.isFetching} />}
          </>
        )}
      </Card>

      {decision?.kind === 'approve' && <ApproveDialog key={decision.request.id} request={decision.request} onClose={() => setDecision(null)} onDone={done} />}
      {decision?.kind === 'reject' && <RejectDialog key={decision.request.id} request={decision.request} onClose={() => setDecision(null)} onDone={done} />}
    </>
  );
}

function ApproveDialog({ request, onClose, onDone }: { request: AdminSignupRequest; onClose: () => void; onDone: () => void }) {
  const { signup } = useServices();
  const [planId, setPlanId] = useState(request.requestedPlan.id);
  const [note, setNote] = useState('');
  const approve = useMutation({ mutationFn: () => signup.approve(request.id, { planId, note: note.trim() || undefined }), onSuccess: onDone });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Approve ${request.companyName}?`}
      description="An account is created now. The company collects its API key on the status page with its claim code."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => approve.mutate()} loading={approve.isPending}>
            <Check className="size-4" aria-hidden="true" /> Approve and create account
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Account plan" hint={`Requested: ${request.requestedPlan.name}`}>
          {(props) => (
            <Select {...props} value={planId} onChange={(event) => setPlanId(event.target.value)}>
              {ACCOUNT_PLANS.map((plan) => (
                <option key={plan.value} value={plan.value}>
                  {plan.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Message to the company (optional)">
          {(props) => <Textarea {...props} rows={3} maxLength={500} placeholder="Welcome aboard!" value={note} onChange={(event) => setNote(event.target.value)} />}
        </Field>
        {approve.isError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {describeError(approve.error).message}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function RejectDialog({ request, onClose, onDone }: { request: AdminSignupRequest; onClose: () => void; onDone: () => void }) {
  const { signup } = useServices();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const reject = useMutation({ mutationFn: () => signup.reject(request.id, note.trim()), onSuccess: onDone });
  const tooShort = note.trim().length < 3;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Deny ${request.companyName}?`}
      description="The company sees your reason on its status page. It can send a new request later."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setTouched(true);
              if (!tooShort) reject.mutate();
            }}
            loading={reject.isPending}
          >
            <X className="size-4" aria-hidden="true" /> Deny request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason" error={touched && tooShort ? 'Give the company a short reason.' : undefined}>
          {(props) => <Textarea {...props} rows={3} maxLength={500} placeholder="e.g. Please apply with your company email address." value={note} onChange={(event) => setNote(event.target.value)} autoFocus />}
        </Field>
        {reject.isError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {describeError(reject.error).message}
          </p>
        )}
      </div>
    </Dialog>
  );
}
