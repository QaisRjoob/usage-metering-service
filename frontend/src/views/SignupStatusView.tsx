import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Check, CircleX, Clock, KeyRound, RefreshCw, Search } from 'lucide-react';
import { signupCredentialsSchema, type ClaimSignupResponse, type SignupCredentials, type SignupRequestStatus } from '@/contracts';
import { useCredentialActions } from '@/hooks/useCredentialActions';
import { useServices } from '@/providers/ServicesProvider';
import { routePaths } from '@/routing/routePaths';
import { describeError } from '@/services/api/apiErrors';
import { formatUtcDateTime } from '@/utils/dateUtils';
import { cn } from '@/utils/formatUtils';
import { signupSession } from '@/utils/signupSession';
import { AuthLayout } from '@/widgets/layout/AuthLayout';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { CopyField } from '@/widgets/ui/CopyField';
import { Field, Input } from '@/widgets/ui/Field';

/** Public: follow a sign-up request with its id + claim code, and collect the API key once approved. */
export default function SignupStatusView() {
  const { signup } = useServices();
  const saved = signupSession.load();
  const [form, setForm] = useState<SignupCredentials>(saved ?? { requestId: '', claimCode: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<SignupCredentials | null>(null);
  const status = useMutation({ mutationFn: (value: SignupCredentials) => signup.status(value) });
  const claim = useMutation({ mutationFn: (value: SignupCredentials) => signup.claim(value) });

  const check = (value: SignupCredentials) => {
    setCredentials(value);
    claim.reset();
    status.mutate(value);
  };

  // Coming straight from "Request sent": show the status right away.
  useEffect(() => {
    if (saved) check(saved);
    // Run once on arrival only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = signupCredentialsSchema.safeParse(form);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.path[0] === 'requestId' ? 'Enter the request ID you received (a UUID).' : 'Enter the claim code you received.');
      return;
    }
    setFormError(null);
    signupSession.save(parsed.data);
    check(parsed.data);
  };

  return (
    <AuthLayout
      wide
      title="Check your request"
      subtitle="Enter the request ID and claim code you received when you sent the request."
      footer={
        <span>
          <Link to={routePaths.signup} className="font-medium text-brand-700 hover:underline">
            New request
          </Link>{' '}
          ·{' '}
          <Link to={routePaths.login} className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </span>
      }
    >
      <Card className="p-6 shadow-sm">
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Request ID">
            {(props) => <Input {...props} spellCheck={false} placeholder="xxxxxxxx-xxxx-…" value={form.requestId} onChange={(event) => setForm({ ...form, requestId: event.target.value })} />}
          </Field>
          <Field label="Claim code">
            {(props) => <Input {...props} type="password" autoComplete="off" spellCheck={false} placeholder="umc_…" value={form.claimCode} onChange={(event) => setForm({ ...form, claimCode: event.target.value })} />}
          </Field>
          <Button type="submit" className="h-10" loading={status.isPending}>
            <Search className="size-4" aria-hidden="true" /> Check
          </Button>
        </form>
        {(formError || status.isError) && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {formError ?? describeError(status.error).message}
          </p>
        )}
      </Card>

      {status.data && credentials && (
        <StatusCard
          status={status.data}
          refreshing={status.isPending}
          onRefresh={() => check(credentials)}
          claim={claim.data}
          claiming={claim.isPending}
          claimError={claim.isError ? describeError(claim.error).message : null}
          onClaim={() => claim.mutate(credentials, { onSuccess: () => status.mutate(credentials) })}
        />
      )}
    </AuthLayout>
  );
}

const STEP_STYLES = {
  done: 'bg-solid-success text-white',
  current: 'bg-solid-brand text-white ring-4 ring-brand-100',
  denied: 'bg-solid-danger text-white',
  todo: 'bg-slate-200 text-slate-500',
} as const;

function Step({ state, icon: Icon, title, detail, last = false }: { state: keyof typeof STEP_STYLES; icon: typeof Check; title: string; detail?: string; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {!last && <span aria-hidden="true" className={cn('absolute top-8 left-[15px] h-[calc(100%-2rem)] w-0.5', state === 'done' ? 'bg-solid-success' : 'bg-slate-200')} />}
      <span className={cn('relative flex size-8 shrink-0 items-center justify-center rounded-full', STEP_STYLES[state])}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="pt-1">
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        {detail && <span className="block text-xs text-slate-500">{detail}</span>}
      </span>
    </li>
  );
}

function StatusCard({
  status,
  refreshing,
  onRefresh,
  claim,
  claiming,
  claimError,
  onClaim,
}: {
  status: SignupRequestStatus;
  refreshing: boolean;
  onRefresh: () => void;
  claim: ClaimSignupResponse | undefined;
  claiming: boolean;
  claimError: string | null;
  onClaim: () => void;
}) {
  const navigate = useNavigate();
  const { signIn } = useCredentialActions();
  const approved = status.status === 'approved';
  const denied = status.status === 'rejected';

  return (
    <Card className="mt-6 p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-900">{status.companyName}</p>
          <p className="text-xs text-slate-500">
            {status.contactName} · {status.requestedPlanName} plan requested
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} loading={refreshing} aria-label="Refresh status">
          <RefreshCw className="size-3.5" aria-hidden="true" /> Refresh
        </Button>
      </div>

      <ol aria-label="Request progress">
        <Step state="done" icon={Check} title="Request sent" detail={formatUtcDateTime(status.submittedAt)} />
        <Step
          state={status.status === 'pending' ? 'current' : 'done'}
          icon={status.status === 'pending' ? Clock : Check}
          title={status.status === 'pending' ? 'Waiting for the operator' : 'Reviewed by the operator'}
          detail={status.status === 'pending' ? 'Usually reviewed within a working day. Refresh to check again.' : status.decidedAt ? formatUtcDateTime(status.decidedAt) : undefined}
        />
        {denied ? (
          <Step state="denied" icon={CircleX} title="Request denied" detail={status.decisionNote ?? undefined} last />
        ) : (
          <Step
            state={approved ? (status.claimed ? 'done' : 'current') : 'todo'}
            icon={KeyRound}
            title={approved ? (status.claimed ? 'API key collected' : 'Approved — collect your API key') : 'Collect your API key'}
            detail={approved && status.decisionNote ? `“${status.decisionNote}”` : undefined}
            last
          />
        )}
      </ol>

      {approved && !status.claimed && !claim && (
        <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
          <p className="text-sm text-slate-600">Your account is ready. The API key is shown once, so have somewhere safe to store it.</p>
          {claimError && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {claimError}
            </p>
          )}
          <Button className="h-11 w-full" onClick={onClaim} loading={claiming}>
            <KeyRound className="size-4" aria-hidden="true" /> Get my API key
          </Button>
        </div>
      )}

      {claim && (
        <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
          <CopyField label="Your API key" value={claim.apiKey} secret />
          <p className="flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Copy it now. Only its hash is stored, so it cannot be shown again.
          </p>
          <Button
            className="h-11 w-full"
            loading={signIn.isPending}
            onClick={() =>
              signIn.mutate(claim.apiKey, {
                onSuccess: (role) => {
                  signupSession.clear();
                  navigate(role === 'account' ? routePaths.account.root : routePaths.login, { replace: true });
                },
              })
            }
          >
            Open my portal <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {approved && status.claimed && !claim && (
        <p className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-600">
          The key was already collected.{' '}
          <Link to={routePaths.login} className="font-medium text-brand-700 hover:underline">
            Sign in with it
          </Link>
          , or ask the operator if it was lost.
        </p>
      )}
    </Card>
  );
}
