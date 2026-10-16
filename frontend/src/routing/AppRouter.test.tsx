import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { credentials } from '@/services/api/credentials';
import { resetMockDb } from '@/services/mock/mockRuntime';
import { DEMO_ACCOUNT_ID, DEMO_API_KEY, MOCK_ADMIN_TOKEN } from '@/services/mock/mockSeed';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AppRouter } from './AppRouter';

const signInAsOperator = () => credentials.setAdminToken(MOCK_ADMIN_TOKEN);
const signInAsAccount = () => credentials.setAccount({ apiKey: DEMO_API_KEY, accountId: DEMO_ACCOUNT_ID, accountName: 'Demo Docs Inc', apiKeyPrefix: 'umk_demo_loca' });

beforeEach(() => {
  resetMockDb();
});

describe('operator interface (/admin)', () => {
  it.each([
    ['/admin', 'Dashboard'],
    ['/admin/accounts', 'Accounts'],
    [`/admin/accounts/${DEMO_ACCOUNT_ID}`, 'Demo Docs Inc'],
    ['/admin/users', 'Users directory'],
    ['/admin/plans', 'Plan catalogue'],
    ['/admin/usage', 'Usage history'],
    ['/admin/advisor', 'AI Usage Advisor'],
  ])('%s renders "%s"', async (route, heading) => {
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route });
    expect(await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 15_000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Plan catalogue/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Client Demo/ })).not.toBeInTheDocument();
  });
});

describe('account interface (/app)', () => {
  it.each([
    ['/app', 'Welcome, Demo Docs Inc'],
    ['/app/users', 'Users'],
    ['/app/plans', 'Plans'],
    ['/app/quotas', 'Quotas'],
    ['/app/usage', 'Usage history'],
    ['/app/demo', 'Client Demo — Document Processor'],
    ['/app/advisor', 'AI Usage Advisor'],
  ])('%s renders "%s"', async (route, heading) => {
    signInAsAccount();
    renderWithProviders(<AppRouter />, { route });
    expect(await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 15_000 })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Accounts$/ })).not.toBeInTheDocument();
  });
});

describe('role separation', () => {
  it('sends a company owner who opens an operator page to their own portal', async () => {
    signInAsAccount();
    renderWithProviders(<AppRouter />, { route: '/admin/accounts' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Demo Docs Inc' })).toBeInTheDocument();
  });

  it('sends the operator who opens an account page to the operator console', async () => {
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route: '/app/users' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('sends anonymous visitors to the login page', async () => {
    renderWithProviders(<AppRouter />, { route: '/app/plans' });
    expect(await screen.findByLabelText('Access token or API key')).toBeInTheDocument();
  });

  it('signing in as one role ends the other session', () => {
    signInAsOperator();
    signInAsAccount();
    expect(credentials.get().adminToken).toBeNull();
    signInAsOperator();
    expect(credentials.get().account).toBeNull();
  });
});

describe('single-field login (the server decides the interface)', () => {
  const field = () => screen.findByLabelText('Access token or API key');
  const signIn = () => screen.getByRole('button', { name: /^Sign in$/ });

  it('opens the operator console for the operator token, on the page that was requested', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRouter />, { route: '/admin/plans' });
    await user.type(await field(), MOCK_ADMIN_TOKEN);
    await user.click(signIn());
    expect(await screen.findByRole('heading', { level: 1, name: 'Plan catalogue' })).toBeInTheDocument();
    expect(credentials.get().adminToken).toBe(MOCK_ADMIN_TOKEN);
  });

  it('opens the account portal for a company API key, and signs out again', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRouter />, { route: '/login' });
    await user.type(await field(), DEMO_API_KEY);
    await user.click(signIn());
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Demo Docs Inc' })).toBeInTheDocument();
    expect(credentials.get().account?.accountName).toBe('Demo Docs Inc');
    await user.click(screen.getByRole('button', { name: /Sign out/ }));
    expect(await field()).toBeInTheDocument();
    expect(credentials.get().account).toBeNull();
  });

  it('ignores a requested page that belongs to the other interface', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRouter />, { route: '/admin/accounts' });
    await user.type(await field(), DEMO_API_KEY);
    await user.click(signIn());
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Demo Docs Inc' })).toBeInTheDocument();
  });

  it('rejects an unknown token with one generic message and stores nothing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRouter />, { route: '/login' });
    await user.type(await field(), 'umk_live_not_a_real_key_at_all');
    await user.click(signIn());
    expect(await screen.findByText('This is neither a valid API key nor the operator token.')).toBeInTheDocument();
    expect(credentials.get()).toEqual({ adminToken: null, account: null });
  });
});

describe('server-side filters, sorting and pagination', () => {
  it('paginates accounts and disables invalid navigation', async () => {
    const user = userEvent.setup();
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route: '/admin/accounts?pageSize=10' });
    expect(await screen.findByText(/Showing 1–10 of 13/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText(/Showing 11–13 of 13/)).toBeInTheDocument();
  });

  it('filters accounts by plan type with a removable chip, and clears it', async () => {
    const user = userEvent.setup();
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route: '/admin/accounts?planKind=custom' });
    expect(await screen.findByText('1 result')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Demo Docs Inc' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove filter Plan type: custom' }));
    expect(await screen.findByText('13 results')).toBeInTheDocument();
  });

  it('shows an inline error instead of requesting an invalid range', async () => {
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route: '/admin/accounts?minUtilization=90&maxUtilization=10' });
    expect(await screen.findByText('Fix the highlighted filter to see results.')).toBeInTheDocument();
    expect(screen.getByText('maxUtilization must be greater than or equal to minUtilization')).toBeInTheDocument();
  });

  it('sorts by clicking a column header (aria-sort reflects it)', async () => {
    const user = userEvent.setup();
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route: '/admin/accounts' });
    const header = await screen.findByRole('button', { name: /Utilization/ });
    await user.click(header);
    await waitFor(() => expect(header.closest('th')).toHaveAttribute('aria-sort', 'descending'));
    await user.click(header);
    await waitFor(() => expect(header.closest('th')).toHaveAttribute('aria-sort', 'ascending'));
  });

  it('filters history to rejections by a user limit', async () => {
    const user = userEvent.setup();
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route: '/admin/usage' });
    await screen.findByRole('heading', { level: 1, name: 'Usage history' }, { timeout: 15_000 });
    const rejectedBy = screen.getByRole('radiogroup', { name: 'Rejected by' });
    await user.click(within(rejectedBy).getByRole('radio', { name: 'User limit' }));
    expect(await screen.findByRole('button', { name: 'Remove filter Rejected by: User (individual)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter Outcome: rejected' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
    for (const row of screen.getAllByRole('row').slice(1)) {
      expect(within(row).getByText('Rejected')).toBeInTheDocument();
      expect(within(row).getByText('User (individual)')).toBeInTheDocument();
    }
  });

  it('finds a company by one of its users (display name) from the accounts search', async () => {
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route: '/admin/accounts?search=Carol%20(Basic)' });
    expect(await screen.findByText('1 result')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Demo Docs Inc' })).toBeInTheDocument();
  });

  it('browses accounts by category tabs that show server-side counts', async () => {
    const user = userEvent.setup();
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route: '/admin/accounts' });
    const activity = await screen.findByRole('radiogroup', { name: 'Activity this month' });
    const all = await within(activity).findByRole('radio', { name: 'All 13' });
    expect(all).toHaveAttribute('aria-checked', 'true');
    const custom = within(screen.getByRole('radiogroup', { name: 'Plan' })).getByRole('radio', { name: 'Demo Shared Pool (Demo Docs Inc) 1' });
    await user.click(custom);
    expect(await screen.findByText('1 result')).toBeInTheDocument();
    expect(custom).toHaveAttribute('aria-checked', 'true');
  });

  it('lists users of every company and opens the company from a row', async () => {
    const user = userEvent.setup();
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route: '/admin/users?search=Bob%20(Premium)' });
    expect(await screen.findByText('1 result', {}, { timeout: 15_000 })).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Demo Docs Inc' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Demo Docs Inc' })).toBeInTheDocument();
  });

  it('jumps to a company from the operator header finder', async () => {
    const user = userEvent.setup();
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route: '/admin' });
    const finder = await screen.findByRole('combobox', { name: 'Find a company or user' });
    await user.type(finder, 'Demo Docs');
    await user.click(await screen.findByRole('option', { name: /Demo Docs Inc/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Demo Docs Inc' })).toBeInTheDocument();
  });

  it('shows the mock data badge in mock mode', async () => {
    signInAsOperator();
    renderWithProviders(<AppRouter />, { route: '/admin' });
    expect(await screen.findByText('MOCK DATA')).toBeInTheDocument();
  });
});
