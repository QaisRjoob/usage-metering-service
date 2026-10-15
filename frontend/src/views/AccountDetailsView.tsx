import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, KeyRound, Search, UserPlus } from 'lucide-react';
import type { UserWithQuota } from '@/models/user';
import { routePaths } from '@/routing/routePaths';
import { formatMonthLabel, formatUtcDateTime } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';
import { useAccountDetailsViewModel } from '@/view_models/useAccountDetailsViewModel';
import { CredentialForm, CredentialsGate } from '@/widgets/common/CredentialsGate';
import { ErrorState } from '@/widgets/common/ErrorState';
import { PageSkeleton, TableSkeleton } from '@/widgets/common/LoadingSkeleton';
import { MonthSelect } from '@/widgets/common/MonthSelect';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { RecentUsageTable } from '@/widgets/dashboard/RecentUsageTable';
import { UserForm } from '@/widgets/forms/UserForm';
import { QuotaSnapshotCard } from '@/widgets/quotas/QuotaSnapshotCard';
import { AssignPlanDialog } from '@/widgets/users/AssignPlanDialog';
import { UsersTable } from '@/widgets/users/UsersTable';
import { Button } from '@/widgets/ui/Button';
import { Card, CardBody, CardHeader } from '@/widgets/ui/Card';
import { Dialog } from '@/widgets/ui/Dialog';
import { Input } from '@/widgets/ui/Field';

function AccountDetailsContent({ accountId }: { accountId: string }) {
  const vm = useAccountDetailsViewModel(accountId);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [planTarget, setPlanTarget] = useState<UserWithQuota | null>(null);
  const [accountPlanOpen, setAccountPlanOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const account = vm.account.data;

  if (vm.account.error && !account) {
    return (
      <>
        <BackLink />
        <ErrorState error={vm.account.error} onRetry={() => void vm.account.refetch()} />
      </>
    );
  }
  if (!account) return <PageSkeleton />;

  return (
    <>
      <BackLink />
      <PageHeader
        title={account.name}
        description={
          <span className="font-mono text-xs">
            {account.id} · key {account.apiKeyPrefix}… · created {formatUtcDateTime(account.createdAt)}
          </span>
        }
        actions={<MonthSelect value={vm.month} onChange={vm.setMonth} />}
      />

      {!vm.canManage && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <p className="flex items-center gap-2">
            <KeyRound className="size-4" aria-hidden="true" />
            Read-only operator view. Registering users and changing plans uses this account&apos;s own API key.
          </p>
          <Button variant="outline" size="sm" onClick={() => setConnectOpen(true)}>
            Connect this account&apos;s key
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3">
          <QuotaSnapshotCard quota={account.quota} title="Account plan (shared by all users)" />
          {vm.canManage && vm.isCurrentMonth && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setAccountPlanOpen(true)}>
              Change account plan
            </Button>
          )}
        </div>
        <Card className="lg:col-span-2">
          <CardHeader title="Requests" description={formatMonthLabel(vm.month)} />
          <CardBody>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-emerald-50 p-3">
                <dt className="text-xs text-emerald-700">Accepted</dt>
                <dd className="text-lg font-semibold tabular-nums text-emerald-900">{formatUnits(account.requests.accepted)}</dd>
              </div>
              <div className="rounded-lg bg-rose-50 p-3">
                <dt className="text-xs text-rose-700">Rejected</dt>
                <dd className="text-lg font-semibold tabular-nums text-rose-900">{formatUnits(account.requests.rejected)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-600">Units rejected</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatUnits(account.requests.unitsRejected)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-slate-500">
              The account&apos;s usage is the sum of accepted usage across its {account.userCount} users. Giving a user a larger plan does not increase the shared allowance.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Users"
          description={`Individual quotas for ${formatMonthLabel(vm.month)}`}
          actions={
            vm.canManage && (
              <Button size="sm" onClick={() => setRegisterOpen(true)}>
                <UserPlus className="size-4" aria-hidden="true" /> Register user
              </Button>
            )
          }
        />
        <div className="border-b border-slate-100 p-4">
          <label className="relative block max-w-sm">
            <span className="sr-only">Search users</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input className="pl-9" placeholder="Search by user id or name" value={vm.searchDraft} onChange={(event) => vm.setSearchDraft(event.target.value)} />
          </label>
        </div>
        {vm.users.error && !vm.users.data ? (
          <ErrorState className="m-4" error={vm.users.error} onRetry={() => void vm.users.refetch()} />
        ) : (
          <>
            <UsersTable
              users={vm.users.data?.items}
              isLoading={vm.users.isPending || vm.users.isFetching}
              onChangePlan={vm.canManage && vm.isCurrentMonth ? setPlanTarget : undefined}
            />
            {vm.users.data && <PaginationControls {...vm.users.data} onPageChange={vm.setUsersPage} isFetching={vm.users.isFetching} />}
          </>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Recent requests"
          description={formatMonthLabel(vm.month)}
          actions={
            <Link to={`${routePaths.usage}?scope=admin&accountId=${encodeURIComponent(accountId)}&month=${vm.month}`} className="text-xs font-medium text-brand-600 hover:underline">
              Full history
            </Link>
          }
        />
        {vm.recent.data ? <RecentUsageTable records={vm.recent.data.items} showAccount={false} /> : vm.recent.error ? <ErrorState compact className="m-4" error={vm.recent.error} /> : <TableSkeleton rows={4} />}
      </Card>

      <Dialog open={registerOpen} onClose={() => setRegisterOpen(false)} title="Register user">
        <UserForm
          plans={vm.plans}
          submitting={vm.createUser.isPending}
          error={vm.createUser.error}
          onCancel={() => setRegisterOpen(false)}
          onSubmit={(request) => vm.createUser.mutate(request, { onSuccess: () => setRegisterOpen(false) })}
        />
      </Dialog>

      {planTarget && (
        <AssignPlanDialog
          key={planTarget.id}
          open
          onClose={() => {
            setPlanTarget(null);
            vm.assignUserPlan.reset();
          }}
          subjectLabel={`user "${planTarget.externalUserId}"`}
          scope="user"
          plans={vm.plans}
          current={planTarget.quota}
          submitting={vm.assignUserPlan.isPending}
          error={vm.assignUserPlan.error}
          onAssign={(planId) => vm.assignUserPlan.mutate({ userId: planTarget.externalUserId, planId }, { onSuccess: () => setPlanTarget(null) })}
        />
      )}

      {accountPlanOpen && (
        <AssignPlanDialog
          open
          onClose={() => {
            setAccountPlanOpen(false);
            vm.assignAccountPlan.reset();
          }}
          subjectLabel="the account"
          scope="account"
          plans={vm.plans}
          current={account.quota}
          submitting={vm.assignAccountPlan.isPending}
          error={vm.assignAccountPlan.error}
          onAssign={(planId) => vm.assignAccountPlan.mutate(planId, { onSuccess: () => setAccountPlanOpen(false) })}
        />
      )}

      <Dialog open={connectOpen} onClose={() => setConnectOpen(false)} title={`Connect ${account.name}`} description="Paste this account's API key. It is verified, then kept in this tab only.">
        <CredentialForm scope="account" onConnected={() => setConnectOpen(false)} />
      </Dialog>
    </>
  );
}

function BackLink() {
  return (
    <Link to={routePaths.accounts} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="size-4" aria-hidden="true" /> All accounts
    </Link>
  );
}

export default function AccountDetailsView() {
  const { accountId = '' } = useParams();
  return (
    <CredentialsGate scope="admin">
      <AccountDetailsContent accountId={accountId} />
    </CredentialsGate>
  );
}
