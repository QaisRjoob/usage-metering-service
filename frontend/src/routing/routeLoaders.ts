import { lazy } from 'react';

/**
 * Page-level code splitting: each view is loaded on first navigation. This is about JavaScript
 * bundles only; API pagination is handled separately by the services.
 */
export const LoginView = lazy(() => import('@/views/LoginView'));
export const SignupView = lazy(() => import('@/views/SignupView'));
export const SignupStatusView = lazy(() => import('@/views/SignupStatusView'));

// Operator interface (/admin)
export const DashboardView = lazy(() => import('@/views/DashboardView'));
export const AccountsView = lazy(() => import('@/views/AccountsView'));
export const AccountDetailsView = lazy(() => import('@/views/AccountDetailsView'));
export const OperatorUserDetailsView = lazy(() => import('@/views/UserDetailsView').then((module) => ({ default: module.OperatorUserDetailsView })));
export const CompanyStatsView = lazy(() => import('@/views/CompanyStatsView'));
export const AccessRequestsView = lazy(() => import('@/views/AccessRequestsView'));
export const OperatorUsersView = lazy(() => import('@/views/OperatorUsersView'));
export const OperatorPlansView = lazy(() => import('@/views/OperatorPlansView'));
export const OperatorUsageHistoryView = lazy(() => import('@/views/UsageHistoryView').then((module) => ({ default: module.OperatorUsageHistoryView })));
export const OperatorAiAdvisorView = lazy(() => import('@/views/AiAdvisorView').then((module) => ({ default: module.OperatorAiAdvisorView })));

// Account interface (/app)
export const AccountOverviewView = lazy(() => import('@/views/AccountOverviewView'));
export const UsersView = lazy(() => import('@/views/UsersView'));
export const AccountUserDetailsView = lazy(() => import('@/views/UserDetailsView').then((module) => ({ default: module.AccountUserDetailsView })));
export const PlansView = lazy(() => import('@/views/PlansView'));
export const QuotasView = lazy(() => import('@/views/QuotasView'));
export const AccountUsageHistoryView = lazy(() => import('@/views/UsageHistoryView').then((module) => ({ default: module.AccountUsageHistoryView })));
export const ClientDemoView = lazy(() => import('@/views/ClientDemoView'));
export const AccountAiAdvisorView = lazy(() => import('@/views/AiAdvisorView').then((module) => ({ default: module.AccountAiAdvisorView })));

export const NotFoundView = lazy(() => import('@/views/NotFoundView'));
