import { lazy } from 'react';

/**
 * Page-level code splitting: each view is loaded on first navigation. This is about JavaScript
 * bundles only; API pagination is handled separately by the services.
 */
export const DashboardView = lazy(() => import('@/views/DashboardView'));
export const AccountsView = lazy(() => import('@/views/AccountsView'));
export const AccountDetailsView = lazy(() => import('@/views/AccountDetailsView'));
export const PlansView = lazy(() => import('@/views/PlansView'));
export const QuotasView = lazy(() => import('@/views/QuotasView'));
export const UsageHistoryView = lazy(() => import('@/views/UsageHistoryView'));
export const ClientDemoView = lazy(() => import('@/views/ClientDemoView'));
export const AiAdvisorView = lazy(() => import('@/views/AiAdvisorView'));
export const NotFoundView = lazy(() => import('@/views/NotFoundView'));
