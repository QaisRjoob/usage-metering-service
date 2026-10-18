import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ArrowRight, Building2, Check, Copy, Eye, EyeOff, FlaskConical, KeyRound, LogIn, ShieldCheck, type LucideIcon } from 'lucide-react';
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

/** A ready-made credential shown on the login page so visitors can try the app. */
interface TestAccount {
  id: string;
  icon: LucideIcon;
  title: string;
  name?: string;
  description: string;
  token: string;
}

/**
 * One field for everyone. The server identifies the token (POST /auth/token): the operator's
 * admin token opens the operator console, an account API key opens that company's portal.
 */
export default function LoginView() {
  const session = useCredentials();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token, setToken] = useState('');
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { signIn } = useCredentialActions();
  const current = roleOf(session);

  // Already signed in when arriving here -> straight to your interface. (After signing in on this
  // page, onSuccess navigates to the requested page instead.)
  if (session.status === 'restoring') return <PageSkeleton />;
  if (current && signIn.isIdle) return <Navigate to={homeFor(current)} replace />;

  const demoKey = apiConfig.demoApiKey ?? (isMockMode ? DEMO_API_KEY : null);
  const demoOperatorToken = apiConfig.demoOperatorToken ?? (isMockMode ? MOCK_ADMIN_TOKEN : null);
  const testAccounts: TestAccount[] = [];
  if (demoKey) {
    testAccounts.push({
      id: 'company',
      icon: Building2,
      title: 'Demo company',
      name: 'شركة الوثائق التجريبية',
      description: 'Company portal: users, plans, quotas, history and the Client Demo.',
      token: demoKey,
    });
  }
  if (demoOperatorToken) {
    testAccounts.push({
      id: 'operator',
      icon: ShieldCheck,
      title: 'Operator',
      description: 'Operator console: every company, access requests and analytics.',
      token: demoOperatorToken,
    });
  }

  const signInWith = (value: string) =>
    signIn.mutate(value, { onSuccess: (role) => navigate(safeNext(params.get('next'), role), { replace: true }) });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    signInWith(token);
  };

  const copy = async (account: TestAccount) => {
    try {
      await navigator.clipboard.writeText(account.token);
      setCopied(account.id);
      window.setTimeout(() => setCopied((current) => (current === account.id ? null : current)), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context): fill the field instead so it can still be used.
      setToken(account.token);
    }
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

        {testAccounts.length > 0 && (
          <section aria-labelledby="test-accounts-title" className="mt-6 border-t border-slate-100 pt-5">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-4 text-brand-600" aria-hidden="true" />
              <h2 id="test-accounts-title" className="text-sm font-semibold text-slate-800">
                Test accounts
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">Want to try the app? Sign in with sample data in one click.</p>
            <ul className="mt-3 space-y-2">
              {testAccounts.map((account) => (
                <li key={account.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start gap-3">
                    <account.icon className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{account.title}</p>
                      {account.name && (
                        <p dir="rtl" className="text-left text-xs font-medium text-slate-600">
                          {account.name}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-500">{account.description}</p>
                      <code className="mt-2 block truncate rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600" title={account.token}>
                        {account.token}
                      </code>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="flex-1" disabled={signIn.isPending} onClick={() => signInWith(account.token)}>
                      <LogIn className="size-3.5" aria-hidden="true" /> Sign in as {account.title.toLowerCase()}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void copy(account)} aria-label={`Copy the ${account.title.toLowerCase()} credential`}>
                      {copied === account.id ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                      {copied === account.id ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-400">Shared sample data: anyone can see and change it.</p>
          </section>
        )}
      </Card>
      <p className="mt-4 text-center text-xs text-slate-400">Your key stays in this browser tab only and is cleared when you sign out or close it.</p>
    </AuthLayout>
  );
}
