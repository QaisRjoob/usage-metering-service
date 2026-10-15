import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { credentials } from '@/services/api/credentials';
import { resetMockDb } from '@/services/mock/mockRuntime';
import { DEMO_ACCOUNT_ID, DEMO_API_KEY } from '@/services/mock/mockSeed';
import { renderWithProviders } from '@/test/renderWithProviders';
import ClientDemoView from './ClientDemoView';

beforeEach(() => {
  resetMockDb();
  credentials.setAccount({ apiKey: DEMO_API_KEY, accountId: DEMO_ACCOUNT_ID, accountName: 'Demo Docs Inc', apiKeyPrefix: 'umk_demo_loca' });
});

const decisionRegion = () => screen.getByText('Decision').closest('div.rounded-xl') as HTMLElement;

describe('Client Demo scenario (mock services)', () => {
  it('walks through accepted, user-limit, account-limit, plan change and idempotent retry', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientDemoView />);

    await screen.findByRole('button', { name: /process document/i });

    // 1. Accepted: alice, 10 units.
    await user.click(screen.getByRole('button', { name: /run step 1/i }));
    expect(await within(decisionRegion()).findByText(/Accepted · 10 units/)).toBeInTheDocument();

    // 2. Rejected by alice's user per-request limit (Basic: 20).
    await user.click(screen.getByRole('button', { name: /run step 2/i }));
    expect(await within(decisionRegion()).findByText(/Rejected · 25 units/)).toBeInTheDocument();
    expect(within(decisionRegion()).getByText('(MAX_UNITS_PER_REQUEST)')).toBeInTheDocument();
    expect(within(decisionRegion()).getByText('User (individual)')).toBeInTheDocument();

    // 3. Rejected by the shared account pool (100/month, 90 left) although bob has plenty left.
    await user.click(screen.getByRole('button', { name: /run step 3/i }));
    expect(await within(decisionRegion()).findByText(/Rejected · 95 units/)).toBeInTheDocument();
    expect(within(decisionRegion()).getByText('(MONTHLY_ALLOWANCE)')).toBeInTheDocument();
    expect(within(decisionRegion()).getByText('Account (shared)')).toBeInTheDocument();

    // 4. Switch alice to Premium in the plan panel, then repeat step 2 with the same client code.
    await user.click(screen.getByRole('button', { name: /switch plan/i }));
    await screen.findByText(/Plan switched/);
    await user.click(screen.getByRole('button', { name: /run step 2/i }));
    expect(await within(decisionRegion()).findByText(/Accepted · 25 units/)).toBeInTheDocument();

    // 5. Retry the same request id: replayed, nothing consumed again.
    await user.click(screen.getByRole('button', { name: /retry same request/i }));
    expect(await within(decisionRegion()).findByText(/Idempotent replay/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getAllByLabelText('Done')).toHaveLength(5));
  });
});
