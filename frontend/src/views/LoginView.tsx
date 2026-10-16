import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { BarChart3, Building2, ShieldCheck } from 'lucide-react';
import { useCredentialActions } from '@/hooks/useCredentialActions';
import { useCredentials } from '@/hooks/useCredentials';
import { homeFor } from '@/routing/routePaths';
import { apiConfig, isMockMode } from '@/services/api/apiConfig';
import { describeError } from '@/services/api/apiErrors';
import { roleOf, type SessionRole } from '@/services/api/credentials';
import { DEMO_API_KEY, MOCK_ADMIN_TOKEN } from '@/services/mock/mockSeed';
import { cn } from '@/utils/formatUtils';
import { Badge } from '@/widgets/ui/Badge';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { Field, Input } from '@/widgets/ui/Field';

const roles: Record<SessionRole, { title: string; who: string; description: string; label: string; placeholder: string; icon: typeof Building2 }> = {
  account: {
    title: 'Company account',
    who: 'For a company using the service',
    description: 'Manage your users and plans, follow your usage and try the Client Demo. Sign in with your account API key.',
    label: 'Account API key',
    placeholder: 'umk_live_…',
    icon: Building2,
  },
  operator: {
    title: 'Operator',
    who: 'For the people running the service',
    description: 'See every account, create accounts, browse all plans and the history across companies. Sign in with the admin token.',
    label: 'Admin token',
    placeholder: 'Paste the admin token',
    icon: ShieldCheck,
  },
};

/** Only follow a ?next= path that belongs to the role that just signed in. */
function safeNext(next: string | null, role: SessionRole): string {
  const prefix = role === 'operator' ? '/admin' : '/app';
  return next && next.startsWith(prefix) ? next : homeFor(role);
}

export default function LoginView() {
  const session = useCredentials();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState<SessionRole>(params.get('role') === 'operator' ? 'operator' : 'account');
  const [value, setValue] = useState('');
  const { connectAccount, connectAdmin } = useCredentialActions();
  const mutation = role === 'operator' ? connectAdmin : connectAccount;
  const current = roleOf(session);

  // Already signed in when arriving here -> straight to your interface. (After signing in on this
  // page, onSuccess navigates to the requested page instead.)
  if (current && connectAccount.isIdle && connectAdmin.isIdle) return <Navigate to={homeFor(current)} replace />;

  const demoValue = role === 'operator' ? (isMockMode ? MOCK_ADMIN_TOKEN : null) : (apiConfig.demoApiKey ?? (isMockMode ? DEMO_API_KEY : null));
  const copy = roles[role];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    mutation.mutate(value.trim(), { onSuccess: () => navigate(safeNext(params.get('next'), role), { replace: true }) });
  };

  const choose = (next: SessionRole) => {
    setRole(next);
    setValue('');
    connectAccount.reset();
    connectAdmin.reset();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <BarChart3 className="size-5" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-slate-900">Usage Metering & Quota Service</h1>
            <p className="text-xs text-slate-500">Sign in to your interface</p>
          </div>
          {isMockMode && <Badge tone="warning">MOCK DATA</Badge>}
        </div>

        <Card className="p-6">
          <div role="tablist" aria-label="Sign in as" className="grid grid-cols-2 gap-2">
            {(['account', 'operator'] as const).map((option) => {
              const Icon = roles[option].icon;
              return (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={role === option}
                  onClick={() => choose(option)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-3 text-left text-sm',
                    role === option ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="block font-semibold">{roles[option].title}</span>
                    <span className="text-xs text-slate-500">{roles[option].who}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-5 text-sm text-slate-600">{copy.description}</p>

          <form onSubmit={submit} className="mt-4 space-y-3">
            <Field label={copy.label} error={mutation.isError ? describeError(mutation.error).message : undefined}>
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={copy.placeholder}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  autoFocus
                />
              )}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={mutation.isPending} disabled={!value.trim()}>
                Sign in as {copy.title.toLowerCase()}
              </Button>
              {demoValue && (
                <Button variant="outline" onClick={() => setValue(demoValue)}>
                  Use {isMockMode ? 'mock' : 'seeded'} demo {role === 'operator' ? 'token' : 'key'}
                </Button>
              )}
            </div>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-slate-500">
          Credentials are kept in this browser tab only. Signing in with one role signs you out of the other.
        </p>
      </div>
    </div>
  );
}
