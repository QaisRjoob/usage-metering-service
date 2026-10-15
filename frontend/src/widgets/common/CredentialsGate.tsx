import { useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useCredentialActions } from '@/hooks/useCredentialActions';
import { useCredentials } from '@/hooks/useCredentials';
import { apiConfig, isMockMode } from '@/services/api/apiConfig';
import { describeError } from '@/services/api/apiErrors';
import { DEMO_API_KEY, MOCK_ADMIN_TOKEN } from '@/services/mock/mockSeed';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { Field, Input } from '@/widgets/ui/Field';

type Scope = 'admin' | 'account';

const copy: Record<Scope, { title: string; description: string; label: string; placeholder: string }> = {
  admin: {
    title: 'Operator access required',
    description: 'This page shows data across all accounts. Enter the operator admin token (ADMIN_API_TOKEN on the server). It is kept in this browser tab only.',
    label: 'Admin token',
    placeholder: 'Paste the admin token',
  },
  account: {
    title: 'Connect an account',
    description: 'This page acts on behalf of one account, exactly like a calling application. Enter that account’s API key (sent as the X-API-Key header). It is kept in this browser tab only.',
    label: 'Account API key',
    placeholder: 'umk_…',
  },
};

/** Inline form that stores a verified credential. Used by CredentialsGate and the header panel. */
export function CredentialForm({ scope, onConnected }: { scope: Scope; onConnected?: () => void }) {
  const [value, setValue] = useState('');
  const { connectAccount, connectAdmin } = useCredentialActions();
  const mutation = scope === 'admin' ? connectAdmin : connectAccount;
  const demoValue = scope === 'admin' ? (isMockMode ? MOCK_ADMIN_TOKEN : null) : (apiConfig.demoApiKey ?? (isMockMode ? DEMO_API_KEY : null));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    mutation.mutate(value.trim(), { onSuccess: () => onConnected?.() });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={copy[scope].label} error={mutation.isError ? describeError(mutation.error).message : undefined}>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={copy[scope].placeholder}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={mutation.isPending} disabled={!value.trim()}>
          Connect
        </Button>
        {demoValue && (
          <Button variant="outline" onClick={() => setValue(demoValue)}>
            Use {isMockMode ? 'mock' : 'seeded'} demo {scope === 'admin' ? 'token' : 'key'}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Renders children only when the required credential is present; otherwise asks for it. */
export function CredentialsGate({ scope, children }: { scope: Scope; children: ReactNode }) {
  const state = useCredentials();
  const connected = scope === 'admin' ? Boolean(state.adminToken) : Boolean(state.account);
  if (connected) return <>{children}</>;
  const Icon = scope === 'admin' ? ShieldCheck : KeyRound;
  return (
    <Card className="mx-auto max-w-lg p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-base font-semibold text-slate-900">{copy[scope].title}</h2>
      </div>
      <p className="mb-4 text-sm text-slate-600">{copy[scope].description}</p>
      <CredentialForm scope={scope} />
    </Card>
  );
}
