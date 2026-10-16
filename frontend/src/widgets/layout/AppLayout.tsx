import { useState } from 'react';
import { Outlet } from 'react-router';
import { BarChart3, Bot, Building2, FileClock, Gauge, LayoutDashboard, Layers, PlayCircle, Users, X } from 'lucide-react';
import { routePaths } from '@/routing/routePaths';
import { Header } from './Header';
import { PageContainer } from './PageContainer';
import { Sidebar, type NavSection } from './Sidebar';

/** Operator interface: cross-account administration. */
const operatorNav: NavSection[] = [
  {
    title: 'Administration',
    items: [
      { to: routePaths.operator.root, label: 'Overview', icon: LayoutDashboard, end: true },
      { to: routePaths.operator.accounts, label: 'Accounts', icon: Building2 },
      { to: routePaths.operator.plans, label: 'Plan catalogue', icon: Layers },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: routePaths.operator.usage, label: 'Usage history', icon: FileClock },
      { to: routePaths.operator.advisor, label: 'AI Advisor', icon: Bot },
    ],
  },
];

/** Account interface: one company managing its own users, plans and usage. */
const accountNav: NavSection[] = [
  {
    title: 'My account',
    items: [
      { to: routePaths.account.root, label: 'Overview', icon: LayoutDashboard, end: true },
      { to: routePaths.account.users, label: 'Users', icon: Users },
      { to: routePaths.account.plans, label: 'Plans', icon: Layers },
      { to: routePaths.account.quotas, label: 'Quotas', icon: Gauge },
    ],
  },
  {
    title: 'Activity',
    items: [
      { to: routePaths.account.usage, label: 'Usage history', icon: FileClock },
      { to: routePaths.account.demo, label: 'Client Demo', icon: PlayCircle },
      { to: routePaths.account.advisor, label: 'AI Advisor', icon: Bot },
    ],
  },
];

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <BarChart3 className="size-4" aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-900">Usage Metering</p>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function Layout({ sections, subtitle }: { sections: NavSection[]; subtitle: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200 bg-white lg:block">
        <Brand subtitle={subtitle} />
        <Sidebar sections={sections} />
      </aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <aside className="relative h-full w-64 bg-white shadow-xl">
            <button type="button" className="absolute right-2 top-3 rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setMenuOpen(false)} aria-label="Close navigation">
              <X className="size-5" aria-hidden="true" />
            </button>
            <Brand subtitle={subtitle} />
            <Sidebar sections={sections} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}
      <Header onOpenMenu={() => setMenuOpen(true)} />
      <main id="main">
        <PageContainer>
          <Outlet />
        </PageContainer>
      </main>
    </div>
  );
}

export function OperatorLayout() {
  return <Layout sections={operatorNav} subtitle="Operator console" />;
}

export function AccountLayout() {
  return <Layout sections={accountNav} subtitle="Account portal" />;
}
