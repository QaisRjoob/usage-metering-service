import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRouter } from '@/routing/AppRouter';
import { credentials } from '@/services/api/credentials';
import { createMockSignupService } from '@/services/mock/mockSignupService';
import { resetMockDb } from '@/services/mock/mockRuntime';
import { renderWithProviders } from '@/test/renderWithProviders';
import { signInAsOperator } from '@/test/session';
import { signupSession } from '@/utils/signupSession';

const service = createMockSignupService();
const application = { companyName: 'Initech', contactName: 'Peter Gibbons', contactEmail: 'peter@initech.com' };

beforeEach(() => {
  resetMockDb();
  credentials.clearAll();
  signupSession.clear();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('theme', () => {
  it('switches between light and dark and remembers the choice', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRouter />, { route: '/login' });
    await user.click(await screen.findByRole('button', { name: 'Switch to dark theme' }, { timeout: 15_000 }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('umk-theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('self-service sign-up', () => {
  it('sends a request, shows the request id and claim code, then its status', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRouter />, { route: '/login' });
    await user.click(await screen.findByRole('link', { name: 'Request access' }, { timeout: 15_000 }));
    await user.click(await screen.findByRole('button', { name: /Send request/ }));
    expect(await screen.findByText('Company name must be at least 2 characters')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Company name'), application.companyName);
    await user.type(screen.getByLabelText('Your name'), application.contactName);
    await user.type(screen.getByLabelText('Work email'), application.contactEmail);
    await user.click(screen.getByRole('radio', { name: /Pro/ }));
    await user.click(screen.getByRole('button', { name: /Send request/ }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Request sent' })).toBeInTheDocument();
    expect(screen.getByLabelText('Claim code').textContent).toMatch(/^umc_/);
    await user.click(screen.getByRole('button', { name: /Check my request/ }));
    expect(await screen.findByText('Waiting for the operator')).toBeInTheDocument();
    expect(screen.getByText(/Pro plan requested/)).toBeInTheDocument();
  });

  it('lets the operator approve a request from the access requests page', async () => {
    const user = userEvent.setup();
    signInAsOperator();
    await service.submit(application);
    renderWithProviders(<AppRouter />, { route: '/admin/requests' });
    expect(await screen.findByText('Initech', {}, { timeout: 15_000 })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByLabelText('1 waiting')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve Initech' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve Initech?' });
    await user.type(within(dialog).getByLabelText('Message to the company (optional)'), 'Welcome!');
    await user.click(within(dialog).getByRole('button', { name: /Approve and create account/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('link', { name: 'Open account' })).toBeInTheDocument();
    expect(screen.getByText('Key not collected yet')).toBeInTheDocument();
  });

  it('requires a reason to deny, and the applicant reads it', async () => {
    const user = userEvent.setup();
    signInAsOperator();
    const sent = await service.submit(application);
    renderWithProviders(<AppRouter />, { route: '/admin/requests?status=pending' });
    await user.click(await screen.findByRole('button', { name: 'Deny Initech' }, { timeout: 15_000 }));
    const dialog = await screen.findByRole('dialog', { name: 'Deny Initech?' });
    await user.click(within(dialog).getByRole('button', { name: /Deny request/ }));
    expect(within(dialog).getByText('Give the company a short reason.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason'), 'Use your company email');
    await user.click(within(dialog).getByRole('button', { name: /Deny request/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const status = await service.status({ requestId: sent.requestId, claimCode: sent.claimCode });
    expect(status).toMatchObject({ status: 'rejected', decisionNote: 'Use your company email' });
  });

  it('lets an approved company collect its key once and open its portal', async () => {
    const user = userEvent.setup();
    const sent = await service.submit(application);
    signInAsOperator();
    await service.approve(sent.requestId, { note: 'Welcome!' });
    credentials.clearAll();
    signupSession.save({ requestId: sent.requestId, claimCode: sent.claimCode });

    renderWithProviders(<AppRouter />, { route: '/signup/status' });
    expect(await screen.findByText('Approved — collect your API key', {}, { timeout: 15_000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Get my API key/ }));
    expect((await screen.findByLabelText('Your API key')).textContent).toMatch(/^umk_live_/);
    await user.click(screen.getByRole('button', { name: /Open my portal/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Initech' }, { timeout: 15_000 })).toBeInTheDocument();
  });
});
