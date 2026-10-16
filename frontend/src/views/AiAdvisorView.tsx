import { isMockMode } from '@/services/api/apiConfig';
import type { AiScope } from '@/services/aiAdvisorService';
import { useAiAdvisorViewModel } from '@/view_models/useAiAdvisorViewModel';
import { AiQuestionPanel } from '@/widgets/ai/AiQuestionPanel';
import { AiResponsePanel } from '@/widgets/ai/AiResponsePanel';
import { SuggestedQuestions } from '@/widgets/ai/SuggestedQuestions';
import { ErrorState } from '@/widgets/common/ErrorState';
import { Skeleton } from '@/widgets/common/LoadingSkeleton';
import { MonthSelect } from '@/widgets/common/MonthSelect';
import { PageHeader } from '@/widgets/common/PageHeader';
import { Card, CardBody, CardHeader } from '@/widgets/ui/Card';

function AiAdvisorContent({ scope }: { scope: AiScope }) {
  const vm = useAiAdvisorViewModel(scope);
  return (
    <>
      <PageHeader
        title="AI Usage Advisor"
        description={
          isMockMode
            ? 'Mock mode: answers come from a deterministic rule-based adapter built on the mock data. No AI model is called.'
            : 'Ask questions about usage. The service computes the numbers and the configured AI provider explains them. With an API key the advisor sees only that account.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <MonthSelect value={vm.month} onChange={vm.setMonth} />
          </div>
        }
      />
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader title="Ask" description={vm.scope === 'global' ? 'Answers may cover every account.' : `Answers cover ${vm.accountName ?? 'the connected account'} only.`} />
            <CardBody className="space-y-5">
              <AiQuestionPanel question={vm.question} onChange={vm.setQuestion} onSubmit={() => vm.submit()} pending={vm.ask.isPending} error={vm.validationError} />
              <SuggestedQuestions onPick={(question) => vm.submit(question)} disabled={vm.ask.isPending} />
            </CardBody>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader title="Answer" description={vm.ask.variables ? `“${vm.ask.variables.question}”` : 'Ask a question or pick a suggestion.'} />
            <CardBody>
              {vm.ask.isPending ? (
                <div className="space-y-3" role="status" aria-label="Waiting for the advisor">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                  </div>
                </div>
              ) : vm.ask.isError ? (
                <ErrorState error={vm.ask.error} onRetry={() => vm.submit()} />
              ) : vm.ask.data ? (
                <AiResponsePanel response={vm.ask.data} />
              ) : (
                <p className="text-sm text-slate-500">No answer yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
    </>
  );
}

export function OperatorAiAdvisorView() {
  return <AiAdvisorContent scope="global" />;
}

export function AccountAiAdvisorView() {
  return <AiAdvisorContent scope="account" />;
}
