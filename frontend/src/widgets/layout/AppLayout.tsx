import { useState } from 'react';
import { Outlet } from 'react-router';
import { BarChart3, X } from 'lucide-react';
import { Header } from './Header';
import { PageContainer } from './PageContainer';
import { Sidebar } from './Sidebar';

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <BarChart3 className="size-4" aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-900">Usage Metering</p>
        <p className="text-[11px] text-slate-500">& Quota Service</p>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200 bg-white lg:block">
        <Brand />
        <Sidebar />
      </aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <aside className="relative h-full w-64 bg-white shadow-xl">
            <button type="button" className="absolute right-2 top-3 rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setMenuOpen(false)} aria-label="Close navigation">
              <X className="size-5" aria-hidden="true" />
            </button>
            <Brand />
            <Sidebar onNavigate={() => setMenuOpen(false)} />
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
