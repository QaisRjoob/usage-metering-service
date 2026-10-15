import { useState } from 'react';
import { KeyRound, LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useCredentialActions } from '@/hooks/useCredentialActions';
import { useCredentials } from '@/hooks/useCredentials';
import { isMockMode } from '@/services/api/apiConfig';
import { CredentialForm } from '@/widgets/common/CredentialsGate';
import { Badge } from '@/widgets/ui/Badge';
import { Button } from '@/widgets/ui/Button';
import { Dialog } from '@/widgets/ui/Dialog';

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const state = useCredentials();
  const { disconnectAccount, disconnectAdmin } = useCredentialActions();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu className="size-5" aria-hidden="true" />
      </button>
      {isMockMode && (
        <Badge tone="warning" title="VITE_DATA_SOURCE=mock - data and quota logic come from the in-browser mock adapter">
          MOCK DATA
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-xs text-slate-500 md:flex">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {state.adminToken ? <span className="font-medium text-emerald-700">Operator connected</span> : 'No operator token'}
        </span>
        <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
          <KeyRound className="size-4" aria-hidden="true" />
          {state.account ? (
            <span className="max-w-48 truncate font-medium text-emerald-700" title={`${state.account.accountName} (${state.account.apiKeyPrefix}…)`}>
              {state.account.accountName}
            </span>
          ) : (
            'No account key'
          )}
        </span>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Credentials
        </Button>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Credentials" description="Stored in this browser tab only (sessionStorage). Never placed in URLs or local storage." size="lg">
        <div className="space-y-6">
          <section aria-labelledby="operator-credential">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="operator-credential" className="text-sm font-semibold text-slate-900">
                Operator admin token
              </h3>
              {state.adminToken && (
                <Button variant="ghost" size="sm" onClick={disconnectAdmin}>
                  <LogOut className="size-3.5" aria-hidden="true" /> Clear
                </Button>
              )}
            </div>
            {state.adminToken ? (
              <p className="text-sm text-emerald-700">Connected. Dashboard, Accounts and cross-account history are available.</p>
            ) : (
              <CredentialForm scope="admin" />
            )}
          </section>
          <section aria-labelledby="account-credential" className="border-t border-slate-100 pt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="account-credential" className="text-sm font-semibold text-slate-900">
                Account API key
              </h3>
              {state.account && (
                <Button variant="ghost" size="sm" onClick={disconnectAccount}>
                  <LogOut className="size-3.5" aria-hidden="true" /> Disconnect
                </Button>
              )}
            </div>
            {state.account ? (
              <p className="text-sm text-emerald-700">
                Connected as <strong>{state.account.accountName}</strong> (key {state.account.apiKeyPrefix}…).
              </p>
            ) : (
              <CredentialForm scope="account" />
            )}
          </section>
        </div>
      </Dialog>
    </header>
  );
}
