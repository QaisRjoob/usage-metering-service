import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { UserWithQuota } from '@/models/user';
import { currentUtcMonth } from '@/utils/dateUtils';
import { useUsersViewModel } from '@/view_models/useUsersViewModel';
import { ErrorState } from '@/widgets/common/ErrorState';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { UserForm } from '@/widgets/forms/UserForm';
import { AssignPlanDialog } from '@/widgets/users/AssignPlanDialog';
import { UserFilterBar } from '@/widgets/users/UserFilterBar';
import { UsersTable } from '@/widgets/users/UsersTable';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { Dialog } from '@/widgets/ui/Dialog';

/** Account portal: register users, change their plans, and filter/sort them by quota. */
export default function UsersView() {
  const vm = useUsersViewModel();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [planTarget, setPlanTarget] = useState<UserWithQuota | null>(null);
  const isCurrentMonth = (vm.list.filters.month ?? currentUtcMonth()) === currentUtcMonth();

  return (
    <>
      <PageHeader
        title="Users"
        description="The people using your application. Each user has an individual plan; all of them share your account plan. Filter by status, plan or utilization and click a column to sort."
        actions={
          <Button onClick={() => setRegisterOpen(true)}>
            <UserPlus className="size-4" aria-hidden="true" /> Register user
          </Button>
        }
      />
      <Card>
        <UserFilterBar list={vm.list} planOptions={vm.planOptions} planName={vm.planName} showMonth totalItems={vm.users.data?.totalItems} isFetching={vm.users.isFetching} />
        {!vm.list.isValid ? (
          <p role="alert" className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Fix the highlighted filter to see results.
          </p>
        ) : vm.users.error && !vm.users.data ? (
          <ErrorState className="m-4" error={vm.users.error} onRetry={() => void vm.users.refetch()} />
        ) : (
          <>
            <UsersTable
              users={vm.users.data?.items}
              isLoading={vm.users.isPending || vm.users.isFetching}
              onChangePlan={isCurrentMonth ? setPlanTarget : undefined}
              sort={{ field: vm.list.sort, order: vm.list.order }}
              onSort={vm.list.setSort}
              emptyHint={vm.list.activeCount > 0 ? 'No users match these filters.' : undefined}
              emptyAction={
                vm.list.activeCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={vm.list.clearAll}>
                    Clear all filters
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setRegisterOpen(true)}>
                    Register user
                  </Button>
                )
              }
            />
            {vm.users.data && <PaginationControls {...vm.users.data} onPageChange={vm.list.setPage} onPageSizeChange={vm.list.setPageSize} isFetching={vm.users.isFetching} />}
          </>
        )}
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
    </>
  );
}
