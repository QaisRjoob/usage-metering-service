import { Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { AppLayout } from '@/widgets/layout/AppLayout';
import { PageSkeleton } from '@/widgets/common/LoadingSkeleton';
import {
  AccountDetailsView,
  AccountsView,
  AiAdvisorView,
  ClientDemoView,
  DashboardView,
  NotFoundView,
  PlansView,
  QuotasView,
  UsageHistoryView,
} from './routeLoaders';
import { routePaths } from './routePaths';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={routePaths.dashboard} element={<Lazy view={<DashboardView />} />} />
        <Route path={routePaths.accounts} element={<Lazy view={<AccountsView />} />} />
        <Route path={routePaths.accountDetails} element={<Lazy view={<AccountDetailsView />} />} />
        <Route path={routePaths.plans} element={<Lazy view={<PlansView />} />} />
        <Route path={routePaths.quotas} element={<Lazy view={<QuotasView />} />} />
        <Route path={routePaths.usage} element={<Lazy view={<UsageHistoryView />} />} />
        <Route path={routePaths.clientDemo} element={<Lazy view={<ClientDemoView />} />} />
        <Route path={routePaths.aiAdvisor} element={<Lazy view={<AiAdvisorView />} />} />
        <Route path="*" element={<Lazy view={<NotFoundView />} />} />
      </Route>
    </Routes>
  );
}

function Lazy({ view }: { view: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{view}</Suspense>;
}
