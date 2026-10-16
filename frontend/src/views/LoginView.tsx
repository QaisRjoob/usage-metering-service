import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { BarChart3, Building2, KeyRound, ShieldCheck } from 'lucide-react';
import { useCredentialActions } from '@/hooks/useCredentialActions';
import { useCredentials } from '@/hooks/useCredentials';
import { homeFor } from '@/routing/routePaths';
import { apiConfig, isMockMode } from '@/services/api/apiConfig';
import { describeError } from '@/services/api/apiErrors';
import { roleOf, type SessionRole } from '@/services/api/credentials';
import { DEMO_API_KEY, MOCK_ADMIN_TOKEN } from '@/services/mock/mockSeed';
import { Badge } from '@/widgets/ui/Badge';
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
  const { signIn } = useCredentialActions();
  const current = roleOf(session);

  // Already signed in when arriving here -> straight to your interface. (After signing in on this
  // page, onSuccess navigates to the requested page instead.)
  if (current && signIn.isIdle) return <Navigate to={homeFor(current)} replace />;

  const demoKey = apiConfig.demoApiKey ?? (isMockMode ? DEMO_API_KEY : null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    signIn.mutate(token, { onSuccess: (role) => navigate(safeNext(params.get('next'), role), { replace: true }) });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <BarChart3 className="size-5" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-slate-900">Usage Metering & Quota Service</h1>
            <p className="text-xs text-slate-500">Sign in with your token or API key</p>
          </div>
          {isMockMode && <Badge tone="warning">MOCK DATA</Badge>}
        </div>

        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field
              label="Access token or API key"
              error={signIn.isError ? describeError(signIn.error).message : undefined}
              hint="Paste the key you were given. We recognise what it is and open the right interface."
            >
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="umk_live_… or the operator token"
                  value={token}
                  onChange={(event) => {
                    setToken(event.target.value);
                    if (signIn.isError) signIn.reset();
                  }}
                  autoFocus
                />
              )}
            </Field>
            <Button type="submit" className="w-full" loading={signIn.isPending} disabled={!token.trim()}>
              <KeyRound className="size-4" aria-hidden="true" /> Sign in
            </Button>
          </form>

          <ul className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm text-slate-600">
            <li className="flex gap-3">
              <Building2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
              <span>
                <strong className="text-slate-800">Company API key</strong> (starts with <code className="text-xs">umk_</code>) opens your <strong>account portal</strong>: users, plans, quotas, history and the Client Demo.
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
              <span>
                <strong className="text-slate-800">Operator token</strong> opens the <strong>operator console</strong>: every account, the plan catalogue and history across companies.
              </span>
            </li>
          </ul>

          {(demoKey || isMockMode) && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <span className="w-full text-xs text-slate-500">Local demo:</span>
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
        <p className="mt-4 text-center text-xs text-slate-500">The key is kept in this browser tab only. Signing in again with another key replaces the current session.</p>
      </div>
    </div>
  );
}
