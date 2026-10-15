import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { credentials } from '@/services/api/credentials';
import { resetMockDb } from '@/services/mock/mockRuntime';
import { DEMO_ACCOUNT_ID, DEMO_API_KEY, MOCK_ADMIN_TOKEN } from '@/services/mock/mockSeed';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AppRouter } from './AppRouter';

function connectAll() {
  credentials.setAdminToken(MOCK_ADMIN_TOKEN);
  credentials.setAccount({ apiKey: DEMO_API_KEY, accountId: DEMO_ACCOUNT_ID, accountName: 'Demo Docs Inc', apiKeyPrefix: 'umk_demo_loca' });
}

beforeEach(() => {
  resetMockDb();
});

describe('routes', () => {
  it.each([
    ['/', 'Dashboard'],
    ['/accounts', 'Accounts'],
    [`/accounts/${DEMO_ACCOUNT_ID}`, 'Demo Docs Inc'],
    ['/plans', 'Plans'],
    ['/quotas', 'Quotas'],
    ['/usage', 'Usage history'],
    ['/demo', 'Client Demo — Document Processor'],
    ['/advisor', 'AI Usage Advisor'],
    ['/does-not-exist', 'Page not found'],
  ])('%s renders "%s"', async (route, heading) => {
    connectAll();
    renderWithProviders(<AppRouter />, { route });
    expect(await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 5000 })).toBeInTheDocument();
  });

  it('shows clearly labelled mock data in mock mode', async () => {
    connectAll();
    renderWithProviders(<AppRouter />, { route: '/' });
    expect(await screen.findByText('MOCK DATA')).toBeInTheDocument();
  });
});

describe('credentials gate', () => {
  it('asks for the admin token, rejects an invalid one and accepts a valid one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRouter />, { route: '/accounts' });
    expect(await screen.findByText('Operator access required')).toBeInTheDocument();

    const input = screen.getByLabelText('Admin token');
    await user.type(input, 'wrong-token');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('Invalid admin token.')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, MOCK_ADMIN_TOKEN);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument();
  });

  it('rejects an unknown API key with 401 semantics', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRouter />, { route: '/plans' });
    await user.type(await screen.findByLabelText('Account API key'), 'umk_live_not_a_real_key');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('Invalid API key.')).toBeInTheDocument();
  });
});

describe('accounts pagination', () => {
  it('paginates on the server contract and disables invalid navigation', async () => {
    const user = userEvent.setup();
    connectAll();
    renderWithProviders(<AppRouter />, { route: '/accounts?pageSize=10' });
    expect(await screen.findByText(/Showing 1–10 of 13/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText(/Showing 11–13 of 13/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
});
