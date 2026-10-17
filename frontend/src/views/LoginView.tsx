import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ArrowRight, Building2, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { useCredentialActions } from '@/hooks/useCredentialActions';
import { useCredentials } from '@/hooks/useCredentials';
import { homeFor, routePaths } from '@/routing/routePaths';
import { apiConfig, isMockMode } from '@/services/api/apiConfig';
import { describeError } from '@/services/api/apiErrors';
import { roleOf, type SessionRole } from '@/services/api/credentials';
import { DEMO_API_KEY, MOCK_ADMIN_TOKEN } from '@/services/mock/mockSeed';
import { PageSkeleton } from '@/widgets/common/LoadingSkeleton';
import { AuthLayout } from '@/widgets/layout/AuthLayout';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { Field, Input } from '@/widgets/ui/Field';

/** Only follow a ?next= path that belongs to the interface of the role that signed in. */
function safeNext(next: string | null, role: SessionRole): string {
  const prefix = role === 'operator' ? '/admin' : '/app';
  return next && next.startsWith(prefix) ? next : homeFor(role);
}

/**
 * One field for everyone. The server identifies the token (POST /auth/identify): the operator's
 * admin token opens the operator console, an account API key opens that company's portal.
 */
export default function LoginView() {
  const session = useCredentials();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token, setToken] = useState('');
  const [reveal, setReveal] = useState(false);
  const { signIn } = useCredentialActions();
  const current = roleOf(session);

  // Already signed in when arriving here -> straight to your interface. (After signing in on this
  // page, onSuccess navigates to the requested page instead.)
  if (session.status === 'restoring') return <PageSkeleton />;
  if (current && signIn.isIdle) return <Navigate to={homeFor(current)} replace />;

  const demoKey = apiConfig.demoApiKey ?? (isMockMode ? DEMO_API_KEY : null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    signIn.mutate(token, { onSuccess: (role) => navigate(safeNext(params.get('next'), role), { replace: true }) });
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in with your company API key or the operator token."
      footer={
        <span>
          New company?{' '}
          <Link to={routePaths.signup} className="font-medium text-brand-700 hover:underline">
            Request access
          </Link>{' '}
          ·{' '}
          <Link to={routePaths.signupStatus} className="font-medium text-brand-700 hover:underline">
            Check a request
          </Link>
        </span>
      }
    >
      <Card className="p-6 shadow-sm">
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Access token or API key"
            error={signIn.isError ? describeError(signIn.error).message : undefined}
            hint="We recognise what it is and open the right interface."
          >
            {(props) => (
              <div className="relative">
                <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input
                  {...props}
                  type={reveal ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="umk_live_… or the operator token"
                  className="h-11 pr-10 pl-9"
                  value={token}
                  onChange={(event) => {
                    setToken(event.target.value);
                    if (signIn.isError) signIn.reset();
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setReveal((value) => !value)}
                  aria-label={reveal ? 'Hide token' : 'Show token'}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  {reveal ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </div>
            )}
          </Field>
          <Button type="submit" className="h-11 w-full" loading={signIn.isPending} disabled={!token.trim()}>
            Sign in <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </form>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <Building2 className="size-4 text-brand-600" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium text-slate-800">Company API key</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Starts with <code className="font-mono">umk_</code>. Opens your portal: users, plans, quotas and history.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <ShieldCheck className="size-4 text-brand-600" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium text-slate-800">Operator token</p>
            <p className="mt-0.5 text-xs text-slate-500">Opens the operator console: every company, access requests and analytics.</p>
          </div>
        </div>

        {(demoKey || isMockMode) && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="text-xs text-slate-500">Local demo:</span>
            {demoKey && (
              <Button variant="outline" size="sm" onClick={() => setToken(demoKey)}>
                Use demo company key
              </Button>
            )}
            {isMockMode && (
              <Button variant="outline" size="sm" onClick={() => setToken(MOCK_ADMIN_TOKEN)}>
                Use mock operator token
              </Button>
            )}
          </div>
        )}
      </Card>
      <p className="mt-4 text-center text-xs text-slate-400">Your key stays in this browser tab only and is cleared when you sign out or close it.</p>
    </AuthLayout>
  );
}
