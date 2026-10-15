import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { quotaCheckRequestSchema } from '@/models/consumption';
import { QUOTA_STATUSES, STATUS_LABELS } from '@/models/quota';
import { describeError } from '@/services/api/apiErrors';
import { formatMonthLabel } from '@/utils/dateUtils';
import { parseNumberInput, validateWith, type FieldErrors } from '@/utils/validationUtils';
import { useQuotaViewModel } from '@/view_models/useQuotaViewModel';
import { CredentialsGate } from '@/widgets/common/CredentialsGate';
import { ErrorState } from '@/widgets/common/ErrorState';
import { Skeleton } from '@/widgets/common/LoadingSkeleton';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { DecisionCard } from '@/widgets/demo/DecisionCard';
import { QuotaSnapshotCard } from '@/widgets/quotas/QuotaSnapshotCard';
import { UsersTable } from '@/widgets/users/UsersTable';
import { Button } from '@/widgets/ui/Button';
import { Card, CardBody, CardHeader } from '@/widgets/ui/Card';
import { Field, Input, Select } from '@/widgets/ui/Field';

function DryRunCheck({ vm }: { vm: ReturnType<typeof useQuotaViewModel> }) {
  const [userId, setUserId] = useState('');
  const [units, setUnits] = useState('10');
  const [errors, setErrors] = useState<FieldErrors>({});
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateWith(quotaCheckRequestSchema, { userId, units: parseNumberInput(units) });
    if (!result.success) return setErrors(result.errors);
    setErrors({});
    vm.check.mutate(result.data);
  };
  return (
    <Card>
      <CardHeader title="Check a request (dry run)" description="Evaluates both plans without consuming units or recording history. The real consume call repeats every check atomically." />
      <CardBody className="space-y-4">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end" noValidate>
          <Field label="User id" error={errors.userId}>
            {(props) => <Input {...props} value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="e.g. alice" />}
          </Field>
          <Field label="Units" error={errors.units}>
            {(props) => <Input {...props} type="number" min={1} step={1} value={units} onChange={(event) => setUnits(event.target.value)} />}
          </Field>
          <Button type="submit" loading={vm.check.isPending}>
            Check
          </Button>
        </form>
        {vm.check.isError && (
          <p role="alert" className="text-sm text-rose-600">
            {describeError(vm.check.error).message}
          </p>
        )}
        {vm.check.data && (
          <DecisionCard
            accepted={vm.check.data.allowed}
            rejection={vm.check.data.rejection}
            violations={vm.check.data.violations}
            units={vm.check.variables?.units ?? 0}
            userId={vm.check.variables?.userId ?? ''}
            dryRun
          />
        )}
      </CardBody>
    </Card>
  );
}

function QuotasContent() {
  const vm = useQuotaViewModel();
  const data = vm.quotas.data;
  return (
    <>
      <PageHeader
        title="Quotas"
        description="Both levels apply to every request: the account's shared allowance and each user's individual allowance. Remaining never goes below 0."
      />
      {vm.quotas.error && !data ? (
        <ErrorState error={vm.quotas.error} onRetry={() => void vm.quotas.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {data ? <QuotaSnapshotCard quota={data.account} title={`Account (shared) · ${formatMonthLabel(data.period)}`} /> : <Skeleton className="h-56" />}
            <div className="lg:col-span-2">
              <DryRunCheck vm={vm} />
            </div>
          </div>
          <Card>
            <CardHeader title="User quotas" description="Individual allowances. Users who share a plan still have separate totals." />
            <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
              <label className="relative min-w-56 flex-1">
                <span className="sr-only">Search users</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input className="pl-9" placeholder="Search by user id or name" value={vm.searchDraft} onChange={(event) => vm.setSearchDraft(event.target.value)} />
              </label>
              <label className="sr-only" htmlFor="quota-status">
                Status
              </label>
              <Select id="quota-status" className="w-48" value={vm.params.status ?? ''} onChange={(event) => vm.setStatus(event.target.value)}>
                <option value="">All statuses</option>
                {QUOTA_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </div>
            <UsersTable users={data?.users.items} isLoading={vm.quotas.isPending || vm.quotas.isFetching} emptyHint="No users match these filters." />
            {data && <PaginationControls {...data.users} onPageChange={vm.setPage} isFetching={vm.quotas.isFetching} />}
          </Card>
        </div>
      )}
    </>
  );
}

export default function QuotasView() {
  return (
    <CredentialsGate scope="account">
      <QuotasContent />
    </CredentialsGate>
  );
}
