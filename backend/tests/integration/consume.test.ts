import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consume, consumeOk, createTestContext, keyHeaders, setupWorkedExampleAccount, type TestContext } from '../support/testApp';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());

describe('consume - the brief worked examples, end to end', () => {
  it('25 units: rejected by the user per-request limit; nothing consumed', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    const decision = await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 25 });
    expect(decision.accepted).toBe(false);
    expect(decision.rejection).toMatchObject({ rule: 'MAX_UNITS_PER_REQUEST', level: 'user' });
    expect(decision.account.consumed).toBe(0);
    expect(decision.user.consumed).toBe(0);
  });

  it('10 units: accepted, +10 for the user and +10 for the account', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    const decision = await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 10 });
    expect(decision).toMatchObject({ accepted: true, rejection: null, idempotentReplay: false });
    expect(decision.user).toMatchObject({ consumed: 10, remaining: 990, level: 'user' });
    expect(decision.account).toMatchObject({ consumed: 10, remaining: 9_990, level: 'account' });
  });

  it('account with 5 left: 10 units rejected by the account monthly allowance although the user has plenty', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app, { accountMonthly: 15, accountPerRequest: 100, userMonthly: 1_000, userPerRequest: 20 });
    await consumeOk(ctx.app, apiKey, { userId: 'bob', units: 10 });
    const decision = await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 10 });
    expect(decision.rejection).toMatchObject({ rule: 'MONTHLY_ALLOWANCE', level: 'account', remaining: 5 });
    expect(decision.user.remaining).toBe(1_000);
    expect(decision.account.consumed).toBe(10);
  });

  it('account usage is the sum of its users; users sharing a plan keep separate totals', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 20 });
    const last = await consumeOk(ctx.app, apiKey, { userId: 'bob', units: 15 });
    expect(last.user.consumed).toBe(15);
    expect(last.account.consumed).toBe(35);
    const alice = await ctx.app.inject({ method: 'GET', url: '/api/v1/users/alice', headers: keyHeaders(apiKey) });
    expect(alice.json().quota.consumed).toBe(20);
  });
});

describe('consume - validation and errors', () => {
  it.each([
    [{ userId: 'alice', units: 0, requestId: 'r' }],
    [{ userId: 'alice', units: -5, requestId: 'r' }],
    [{ userId: 'alice', units: 2.5, requestId: 'r' }],
    [{ userId: 'alice', units: '10', requestId: 'r' }],
    [{ userId: 'alice', units: 10 }],
    [{ units: 10, requestId: 'r' }],
  ])('rejects %j with 400 VALIDATION_ERROR', async (payload) => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    const response = await ctx.app.inject({ method: 'POST', url: '/api/v1/usage/consume', headers: keyHeaders(apiKey), payload });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects malformed JSON with 400', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    const response = await ctx.app.inject({ method: 'POST', url: '/api/v1/usage/consume', headers: { ...keyHeaders(apiKey), 'content-type': 'application/json' }, payload: '{"units":' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('answers 404 for an unknown user and records nothing', async () => {
    const { apiKey, accountId } = await setupWorkedExampleAccount(ctx.app);
    const response = await consume(ctx.app, apiKey, { userId: 'ghost', units: 1 });
    expect(response.statusCode).toBe(404);
    const { rows } = await ctx.pool.query('SELECT count(*) AS n FROM usage_records WHERE account_id = $1', [accountId]);
    expect(rows[0].n).toBe(0);
  });
});

describe('idempotency', () => {
  it('replays an accepted decision without consuming again, flagged in body and header', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    const first = await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 10, requestId: 'doc-1' });
    const retry = await consume(ctx.app, apiKey, { userId: 'alice', units: 10, requestId: 'doc-1' });
    expect(retry.headers['idempotent-replayed']).toBe('true');
    const replay = retry.json();
    expect(replay).toMatchObject({ idempotentReplay: true, accepted: true, usageRecordId: first.usageRecordId });
    expect(replay.account.consumed).toBe(10);
    const account = await ctx.app.inject({ method: 'GET', url: '/api/v1/account', headers: keyHeaders(apiKey) });
    expect(account.json().quota.consumed).toBe(10);
  });

  it('replays a rejected decision too (a rejected request needs a new requestId to be re-evaluated)', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 25, requestId: 'doc-big' });
    const replay = await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 25, requestId: 'doc-big' });
    expect(replay).toMatchObject({ accepted: false, idempotentReplay: true, rejection: { level: 'user' } });
  });

  it('answers 409 IDEMPOTENCY_KEY_REUSED when the same requestId comes with a different payload', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 10, requestId: 'doc-2' });
    const units = await consume(ctx.app, apiKey, { userId: 'alice', units: 11, requestId: 'doc-2' });
    const user = await consume(ctx.app, apiKey, { userId: 'bob', units: 10, requestId: 'doc-2' });
    expect(units.statusCode).toBe(409);
    expect(user.statusCode).toBe(409);
    expect(units.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  it('scopes request ids per account', async () => {
    const one = await setupWorkedExampleAccount(ctx.app);
    const two = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, one.apiKey, { userId: 'alice', units: 5, requestId: 'shared-id' });
    const other = await consumeOk(ctx.app, two.apiKey, { userId: 'alice', units: 5, requestId: 'shared-id' });
    expect(other.idempotentReplay).toBe(false);
  });

  it('records the replay count in history', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    const first = await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 1, requestId: 'r-count' });
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 1, requestId: 'r-count' });
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 1, requestId: 'r-count' });
    const record = await ctx.app.inject({ method: 'GET', url: `/api/v1/usage/${first.usageRecordId}`, headers: keyHeaders(apiKey) });
    expect(record.json().replayCount).toBe(2);
  });
});

describe('dry run', () => {
  it('evaluates like consume but never changes counters or history', async () => {
    const { apiKey, accountId } = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 10 });
    const check = await ctx.app.inject({ method: 'POST', url: '/api/v1/quotas/check', headers: keyHeaders(apiKey), payload: { userId: 'alice', units: 25 } });
    expect(check.json()).toMatchObject({ dryRun: true, allowed: false, rejection: { rule: 'MAX_UNITS_PER_REQUEST', level: 'user' }, user: { consumed: 10 } });
    const ok = await ctx.app.inject({ method: 'POST', url: '/api/v1/quotas/check', headers: keyHeaders(apiKey), payload: { userId: 'alice', units: 5 } });
    expect(ok.json()).toMatchObject({ allowed: true, user: { consumed: 10 }, account: { consumed: 10 } });
    const { rows } = await ctx.pool.query('SELECT count(*) AS n FROM usage_records WHERE account_id = $1', [accountId]);
    expect(rows[0].n).toBe(1);
  });
});
