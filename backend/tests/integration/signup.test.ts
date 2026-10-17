import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminSignupRequest, AdminSignupRequestPage, ClaimSignupResponse, SignupRequestStatus, SubmitSignupResponse } from '../../src/contracts';
import { PREDEFINED_PLAN_IDS, adminHeaders, createTestContext, keyHeaders, type TestContext } from '../support/testApp';

let ctx: TestContext;
const tag = `su${randomUUID().slice(0, 6)}`;
const post = (url: string, payload: unknown, headers: Record<string, string> = {}) => ctx.app.inject({ method: 'POST', url: `/api/v1${url}`, payload: payload as object, headers });
const get = (url: string) => ctx.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: adminHeaders });

/** At most a few submissions per file: POST /signup-requests is rate-limited per IP (10/min). */
async function submit(name: string, extra: Record<string, unknown> = {}): Promise<SubmitSignupResponse> {
  const response = await post('/signup-requests', { companyName: `${tag} ${name}`, contactName: 'Dana Lee', contactEmail: `${name}.${tag}@example.com`, ...extra });
  expect(response.statusCode).toBe(201);
  return response.json() as SubmitSignupResponse;
}

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());

describe('self-service sign-up', () => {
  it('accepts a request and returns a request id and a one-time claim code', async () => {
    const created = await submit('acme', { planId: PREDEFINED_PLAN_IDS.pro, useCase: 'Contract OCR' });
    expect(created).toMatchObject({ status: 'pending', requestId: expect.any(String) });
    expect(created.claimCode).toMatch(/^umc_[A-Za-z0-9_-]{30,}$/);

    const status = (await post('/signup-requests/status', { requestId: created.requestId, claimCode: created.claimCode })).json() as SignupRequestStatus;
    expect(status).toMatchObject({ status: 'pending', requestedPlanName: 'Pro', decidedAt: null, claimed: false });
  });

  it('answers a wrong claim code exactly like an unknown request', async () => {
    const created = await submit('probe');
    const wrong = await post('/signup-requests/status', { requestId: created.requestId, claimCode: 'umc_not-the-right-code-at-all' });
    const unknown = await post('/signup-requests/status', { requestId: randomUUID(), claimCode: created.claimCode });
    expect(wrong.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(wrong.json().error.code).toBe('SIGNUP_REQUEST_NOT_FOUND');
    expect(wrong.json().error.message).toBe(unknown.json().error.message);
  });

  it('allows one open request per email and validates the form', async () => {
    const again = await post('/signup-requests', { companyName: `${tag} acme again`, contactName: 'Dana Lee', contactEmail: `ACME.${tag}@example.com` });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('SIGNUP_ALREADY_PENDING');
    const invalid = await post('/signup-requests', { companyName: 'A', contactName: '', contactEmail: 'nope' });
    expect(invalid.statusCode).toBe(400);
    expect((invalid.json().error.details as { path: string }[]).map((issue) => issue.path).sort()).toEqual(['companyName', 'contactEmail', 'contactName']);
    // Only predefined account plans can be requested.
    expect((await post('/signup-requests', { companyName: `${tag} x`, contactName: 'Dana', contactEmail: `x.${tag}@example.com`, planId: PREDEFINED_PLAN_IDS.basic })).statusCode).toBe(422);
  });
});

describe('operator decision and key claim', () => {
  it('approves a request, creating the account; the company claims its key once and can use it', async () => {
    const created = await submit('globex');
    const credentials = { requestId: created.requestId, claimCode: created.claimCode };
    expect((await post('/signup-requests/claim', credentials)).json().error.code).toBe('SIGNUP_NOT_APPROVED');

    const approved = (await post(`/admin/signup-requests/${created.requestId}/approve`, { planId: PREDEFINED_PLAN_IDS.pro, note: 'Welcome aboard' }, adminHeaders)).json() as AdminSignupRequest;
    expect(approved).toMatchObject({ status: 'approved', decisionNote: 'Welcome aboard', account: { id: expect.any(String), name: `${tag} globex` }, claimed: false });

    const status = (await post('/signup-requests/status', credentials)).json() as SignupRequestStatus;
    expect(status).toMatchObject({ status: 'approved', decisionNote: 'Welcome aboard', decidedAt: expect.any(String) });

    const claimed = (await post('/signup-requests/claim', credentials)).json() as ClaimSignupResponse;
    expect(claimed.apiKey).toMatch(/^umk_live_/);
    expect(claimed.account).toMatchObject({ id: approved.account!.id, apiKeyPrefix: claimed.apiKey.slice(0, 13) });

    // The key works and identifies the new account on the approved plan.
    const current = await ctx.app.inject({ method: 'GET', url: '/api/v1/account', headers: keyHeaders(claimed.apiKey) });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ account: { id: approved.account!.id }, plan: { name: 'Pro' } });

    const second = await post('/signup-requests/claim', credentials);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('SIGNUP_ALREADY_CLAIMED');
    expect(((await post('/signup-requests/status', credentials)).json() as SignupRequestStatus).claimed).toBe(true);
  });

  it('denies a request with a reason the applicant can read; a decided request cannot change', async () => {
    const created = await submit('initech');
    const credentials = { requestId: created.requestId, claimCode: created.claimCode };
    expect((await post(`/admin/signup-requests/${created.requestId}/reject`, { note: '' }, adminHeaders)).statusCode).toBe(400);
    const rejected = (await post(`/admin/signup-requests/${created.requestId}/reject`, { note: 'Please use your company email' }, adminHeaders)).json() as AdminSignupRequest;
    expect(rejected).toMatchObject({ status: 'rejected', account: null });
    expect((await post('/signup-requests/status', credentials)).json()).toMatchObject({ status: 'rejected', decisionNote: 'Please use your company email' });
    expect((await post('/signup-requests/claim', credentials)).json().error.code).toBe('SIGNUP_NOT_APPROVED');
    const again = await post(`/admin/signup-requests/${created.requestId}/approve`, {}, adminHeaders);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('SIGNUP_ALREADY_DECIDED');
    // A decided request no longer blocks a new one with the same email.
    await submit('initech');
  });

  it('lists requests with counts per status, search, filter and sorting; operator only', async () => {
    const page = (await get(`/admin/signup-requests?search=${tag}&sort=companyName&order=asc`)).json() as AdminSignupRequestPage;
    expect(page.counts).toEqual({ pending: 3, approved: 1, rejected: 1, total: 5 });
    expect(page.items.map((item) => item.companyName)).toEqual([`${tag} acme`, `${tag} globex`, `${tag} initech`, `${tag} initech`, `${tag} probe`]);
    const pending = (await get(`/admin/signup-requests?search=${tag}&status=pending`)).json() as AdminSignupRequestPage;
    expect(pending.totalItems).toBe(3);
    expect(pending.items[0]).toMatchObject({ contactEmail: expect.stringContaining('@example.com'), requestedPlan: { name: expect.any(String) } });
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/signup-requests' })).statusCode).toBe(401);
    expect((await post(`/admin/signup-requests/${randomUUID()}/approve`, {}, adminHeaders)).statusCode).toBe(404);
  });
});
