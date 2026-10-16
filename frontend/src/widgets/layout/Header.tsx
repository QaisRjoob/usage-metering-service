import { Building2, LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useCredentials } from '@/hooks/useCredentials';
import { routePaths } from '@/routing/routePaths';
import { isMockMode } from '@/services/api/apiConfig';
import { credentials, roleOf } from '@/services/api/credentials';
import { Badge } from '@/widgets/ui/Badge';
import { OperatorFinder } from './OperatorFinder';
import { Button } from '@/widgets/ui/Button';

/** Shows who is signed in (operator, or which company) and the sign-out button. */
export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const session = useCredentials();
  const navigate = useNavigate();
  const role = roleOf(session);

  const signOut = () => {
    credentials.clearAll();
    navigate(routePaths.login, { replace: true });
  };

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
      {role === 'operator' && (
        <div className="hidden min-w-0 flex-1 sm:block">
          <OperatorFinder />
        </div>
      )}
      <div className="ml-auto flex min-w-0 items-center gap-3">
        {role === 'operator' && (
          <span className="flex items-center gap-1.5 text-sm text-slate-600">
            <ShieldCheck className="size-4 text-brand-600" aria-hidden="true" />
            <span className="font-medium">Operator</span>
          </span>
        )}
        {role === 'account' && session.account && (
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-600" title={`API key ${session.account.apiKeyPrefix}…`}>
            <Building2 className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span className="truncate font-medium">{session.account.accountName}</span>
          </span>
        )}
        <Button variant="outline" size="sm" onClick={signOut}>
          <LogOut className="size-3.5" aria-hidden="true" /> Sign out
        </Button>
      </div>
    </header>
  );
}
