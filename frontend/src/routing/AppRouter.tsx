import { Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { PageSkeleton } from '@/widgets/common/LoadingSkeleton';
import { AccountLayout, OperatorLayout } from '@/widgets/layout/AppLayout';
import {
  AccountAiAdvisorView,
  AccountDetailsView,
  AccountOverviewView,
  AccountUsageHistoryView,
  AccountsView,
  ClientDemoView,
  CompanyStatsView,
  DashboardView,
  LoginView,
  NotFoundView,
  OperatorAiAdvisorView,
  OperatorPlansView,
  OperatorUserDetailsView,
  OperatorUsersView,
  OperatorUsageHistoryView,
  PlansView,
  QuotasView,
  UsersView,
} from './routeLoaders';
import { HomeRedirect, RequireRole } from './RequireRole';
import { routePaths } from './routePaths';

const { operator: op, account: acc } = routePaths;

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path={routePaths.login} element={<Lazy view={<LoginView />} />} />

      <Route
        element={
          <RequireRole role="operator">
            <OperatorLayout />
          </RequireRole>
        }
      >
        <Route path={op.root} element={<Lazy view={<DashboardView />} />} />
        <Route path={op.accounts} element={<Lazy view={<AccountsView />} />} />
        <Route path={op.accountDetails} element={<Lazy view={<AccountDetailsView />} />} />
        <Route path={op.userDetails} element={<Lazy view={<OperatorUserDetailsView />} />} />
        <Route path={op.companies} element={<Lazy view={<CompanyStatsView />} />} />
        <Route path={op.users} element={<Lazy view={<OperatorUsersView />} />} />
        <Route path={op.plans} element={<Lazy view={<OperatorPlansView />} />} />
        <Route path={op.usage} element={<Lazy view={<OperatorUsageHistoryView />} />} />
        <Route path={op.advisor} element={<Lazy view={<OperatorAiAdvisorView />} />} />
      </Route>

      <Route
        element={
          <RequireRole role="account">
            <AccountLayout />
          </RequireRole>
        }
      >
        <Route path={acc.root} element={<Lazy view={<AccountOverviewView />} />} />
        <Route path={acc.users} element={<Lazy view={<UsersView />} />} />
        <Route path={acc.plans} element={<Lazy view={<PlansView />} />} />
        <Route path={acc.quotas} element={<Lazy view={<QuotasView />} />} />
        <Route path={acc.usage} element={<Lazy view={<AccountUsageHistoryView />} />} />
        <Route path={acc.demo} element={<Lazy view={<ClientDemoView />} />} />
        <Route path={acc.advisor} element={<Lazy view={<AccountAiAdvisorView />} />} />
      </Route>

      <Route path="*" element={<Lazy view={<NotFoundView />} />} />
    </Routes>
  );
}

function Lazy({ view }: { view: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{view}</Suspense>;
}
