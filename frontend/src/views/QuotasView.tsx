import { useState, type FormEvent } from 'react';
import { quotaCheckRequestSchema } from '@/models/consumption';
import { describeError } from '@/services/api/apiErrors';
import { formatMonthLabel } from '@/utils/dateUtils';
import { parseNumberInput, validateWith, type FieldErrors } from '@/utils/validationUtils';
import { useQuotaViewModel } from '@/view_models/useQuotaViewModel';
import { ErrorState } from '@/widgets/common/ErrorState';
import { Skeleton } from '@/widgets/common/LoadingSkeleton';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { DecisionCard } from '@/widgets/demo/DecisionCard';
import { QuotaSnapshotCard } from '@/widgets/quotas/QuotaSnapshotCard';
import { UserFilterBar } from '@/widgets/users/UserFilterBar';
import { UsersTable } from '@/widgets/users/UsersTable';
import { Button } from '@/widgets/ui/Button';
import { Card, CardBody, CardHeader } from '@/widgets/ui/Card';
import { Field, Input } from '@/widgets/ui/Field';

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
            {(props) => <Input {...props} value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="e.g. ahmad" />}
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
            <CardHeader title="User quotas" description="Individual allowances, most-used first. Users who share a plan still have separate totals." />
            <UserFilterBar list={vm.list} planOptions={vm.planOptions} planName={vm.planName} showMonth={false} totalItems={data?.users.totalItems} isFetching={vm.quotas.isFetching} />
            {!vm.list.isValid ? (
              <p role="alert" className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Fix the highlighted filter to see results.
              </p>
            ) : (
              <>
                <UsersTable
                  users={data?.users.items}
                  isLoading={vm.quotas.isPending || vm.quotas.isFetching}
                  sort={{ field: vm.list.sort, order: vm.list.order }}
                  onSort={vm.list.setSort}
                  emptyHint="No users match these filters."
                />
                {data && <PaginationControls {...data.users} onPageChange={vm.list.setPage} onPageSizeChange={vm.list.setPageSize} isFetching={vm.quotas.isFetching} />}
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

export default function QuotasView() {
  return (
    <QuotasContent />
  );
}
