import { CheckCircle2, Circle, Play } from 'lucide-react';
import { formatUtcDateTime } from '@/utils/dateUtils';
import { cn } from '@/utils/formatUtils';
import { formatUnits } from '@/utils/numberUtils';
import { useClientDemoViewModel } from '@/view_models/useClientDemoViewModel';
import { EmptyState } from '@/widgets/common/EmptyState';
import { ErrorState } from '@/widgets/common/ErrorState';
import { Skeleton } from '@/widgets/common/LoadingSkeleton';
import { PageHeader } from '@/widgets/common/PageHeader';
import { AllowanceComparison } from '@/widgets/demo/AllowanceComparison';
import { DecisionCard } from '@/widgets/demo/DecisionCard';
import { PlanControlsPanel } from '@/widgets/demo/PlanControlsPanel';
import { ProcessDocumentPanel } from '@/widgets/demo/ProcessDocumentPanel';
import { OutcomeBadge } from '@/widgets/usage/OutcomeBadge';
import { Badge } from '@/widgets/ui/Badge';
import { Button } from '@/widgets/ui/Button';
import { Card, CardBody, CardHeader } from '@/widgets/ui/Card';

function ClientDemoContent() {
  const vm = useClientDemoViewModel();
  const users = vm.users.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Client Demo — Document Processor"
        description={
          <>
            A simulated application that calls the service with <strong>{vm.account?.accountName}</strong>&apos;s API key (<code className="text-xs">X-API-Key: {vm.account?.apiKeyPrefix}…</code>) on behalf of its users. It only uses the public account-scoped API.
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Client application" description="Every click sends POST /usage/consume with a fresh requestId." />
            <CardBody>
              {vm.users.error ? (
                <ErrorState compact error={vm.users.error} onRetry={() => void vm.users.refetch()} />
              ) : !vm.users.data ? (
                <Skeleton className="h-64" />
              ) : users.length === 0 ? (
                <EmptyState title="This account has no users" description="Register users on the Account details page first." />
              ) : (
                <ProcessDocumentPanel
                  users={users}
                  userId={vm.userId}
                  onUserChange={vm.setUserId}
                  units={vm.units}
                  onUnitsChange={vm.setUnits}
                  onProcess={() => vm.processDocument()}
                  onRetry={vm.retrySameRequest}
                  lastRequest={vm.lastRequest}
                  pending={vm.consume.isPending}
                  error={vm.consume.error}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Guided scenario" description="Run the steps in order on the seeded demo account (Demo Shared Pool: 100 units/month)." />
            <CardBody>
              <ol className="space-y-3">
                {vm.steps.map((step, index) => (
                  <li key={step.id} className="flex gap-3">
                    {step.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-slate-300" aria-label="Not done yet" />}
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm font-medium', step.done ? 'text-emerald-800' : 'text-slate-900')}>
                        {index + 1}. {step.title}
                      </p>
                      <p className="text-xs text-slate-500">{step.hint}</p>
                    </div>
                    {step.preset && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={vm.consume.isPending || !users.some((user) => user.externalUserId === step.preset?.userId)}
                        onClick={() => step.preset && vm.processDocument(step.preset)}
                        aria-label={`Run step ${index + 1}: ${step.preset.userId}, ${step.preset.units} units`}
                      >
                        <Play className="size-3.5" aria-hidden="true" /> Run
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 xl:col-span-3">
          <Card>
            <CardHeader title="Decision" description="What the service answered, and both remaining allowances after it." />
            <CardBody className="space-y-4">
              {vm.latest ? (
                <>
                  <DecisionCard
                    accepted={vm.latest.decision.accepted}
                    rejection={vm.latest.decision.rejection}
                    violations={vm.latest.decision.violations}
                    units={vm.latest.decision.units}
                    userId={vm.latest.decision.userId}
                    requestId={vm.latest.decision.requestId}
                    idempotentReplay={vm.latest.decision.idempotentReplay}
                  />
                  <AllowanceComparison decision={vm.latest.decision} />
                </>
              ) : (
                <EmptyState title="No decision yet" description="Process a document or run a scenario step." />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Plan changes (account configuration)" description="Acts like another tab of the account's admin tools. The client code on the left does not change." />
            <CardBody>
              <PlanControlsPanel users={users} plans={vm.plans} currentAccount={vm.currentAccount} assignUserPlan={vm.assignUserPlan} updatePlan={vm.updatePlan} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Request log (this session)"
              actions={
                vm.log.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={vm.clearLog}>
                    Clear
                  </Button>
                )
              }
            />
            {vm.log.length === 0 ? (
              <EmptyState title="Nothing sent yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {vm.log.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
                    <OutcomeBadge outcome={entry.decision.accepted ? 'accepted' : 'rejected'} />
                    <span className="font-mono text-xs">{entry.request.userId}</span>
                    <span className="tabular-nums">{formatUnits(entry.request.units)} units</span>
                    {entry.decision.rejection && (
                      <span className="text-xs text-rose-700">
                        {entry.decision.rejection.rule} · {entry.decision.rejection.level}
                      </span>
                    )}
                    {entry.decision.idempotentReplay && <Badge tone="info">replay</Badge>}
                    <span className="ml-auto text-xs text-slate-500">
                      acct left {formatUnits(entry.decision.account.remaining)} · user left {formatUnits(entry.decision.user.remaining)} · {formatUtcDateTime(entry.decision.processedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function ClientDemoView() {
  return (
    <ClientDemoContent />
  );
}
