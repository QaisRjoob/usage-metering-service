import { randomUUID } from 'node:crypto';
import type { ConsumeDecision } from '../../src/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consume, createTestContext, keyHeaders, registerUser, setupWorkedExampleAccount, type TestContext } from '../support/testApp';

/**
 * Many simultaneous requests through the real HTTP stack and a 30-connection pool, so PostgreSQL
 * sees genuinely concurrent transactions. After each run the persisted state is checked:
 * counters equal the sum of accepted records, at both levels, and no limit was exceeded.
 */
let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext({ poolSize: 30 });
});
afterAll(async () => ctx.close());

async function fireConcurrently(apiKey: string, requests: { userId: string; units: number; requestId?: string }[]): Promise<ConsumeDecision[]> {
  const responses = await Promise.all(requests.map((request) => consume(ctx.app, apiKey, request)));
  for (const response of responses) expect(response.statusCode, response.body).toBe(200);
  return responses.map((response) => response.json() as ConsumeDecision);
}

/** Counters vs. records, per account and per user, for every period of the account. */
async function assertCountersMatchRecords(accountId: string): Promise<void> {
  const accountCheck = await ctx.pool.query(
    `SELECT c.consumed AS counter,
            COALESCE((SELECT sum(units_requested) FROM usage_records r WHERE r.account_id = c.account_id AND r.period = c.period AND r.outcome = 'accepted'), 0) AS records
     FROM account_usage_counters c WHERE c.account_id = $1`,
    [accountId],
  );
  for (const row of accountCheck.rows) expect(row.counter).toBe(row.records);
  const userCheck = await ctx.pool.query(
    `SELECT c.user_id, c.consumed AS counter,
            COALESCE((SELECT sum(units_requested) FROM usage_records r WHERE r.user_id = c.user_id AND r.period = c.period AND r.outcome = 'accepted'), 0) AS records
     FROM user_usage_counters c JOIN users u ON u.id = c.user_id WHERE u.account_id = $1`,
    [accountId],
  );
  for (const row of userCheck.rows) expect(row.counter, `user ${row.user_id}`).toBe(row.records);
}

describe('concurrent consumption', () => {
  it('never exceeds the shared account allowance when many users compete', async () => {
    const { apiKey, accountId } = await setupWorkedExampleAccount(ctx.app, { accountMonthly: 500, accountPerRequest: 100, userMonthly: 1_000, userPerRequest: 20 });
    const users = Array.from({ length: 20 }, (_, index) => `user-${index}`);
    for (const user of users) await registerUser(ctx.app, apiKey, user);
    const decisions = await fireConcurrently(
      apiKey,
      Array.from({ length: 120 }, (_, index) => ({ userId: users[index % users.length]!, units: 10 })),
    );
    const accepted = decisions.filter((decision) => decision.accepted);
    expect(accepted).toHaveLength(50);
    expect(decisions.filter((decision) => !decision.accepted).every((decision) => decision.rejection?.rule === 'MONTHLY_ALLOWANCE' && decision.rejection.level === 'account')).toBe(true);
    const counter = await ctx.pool.query('SELECT consumed FROM account_usage_counters WHERE account_id = $1', [accountId]);
    expect(counter.rows[0].consumed).toBe(500);
    await assertCountersMatchRecords(accountId);
  });

  it('never exceeds an individual user allowance', async () => {
    const { apiKey, accountId } = await setupWorkedExampleAccount(ctx.app, { accountMonthly: 100_000, accountPerRequest: 100, userMonthly: 100, userPerRequest: 20 });
    const decisions = await fireConcurrently(apiKey, Array.from({ length: 60 }, () => ({ userId: 'alice', units: 5 })));
    expect(decisions.filter((decision) => decision.accepted)).toHaveLength(20);
    expect(decisions.filter((decision) => !decision.accepted).every((decision) => decision.rejection?.level === 'user')).toBe(true);
    await assertCountersMatchRecords(accountId);
  });

  it('gives the last remaining units to exactly one request', async () => {
    const { apiKey, accountId } = await setupWorkedExampleAccount(ctx.app, { accountMonthly: 7, accountPerRequest: 100, userMonthly: 1_000, userPerRequest: 20 });
    const decisions = await fireConcurrently(apiKey, Array.from({ length: 25 }, (_, index) => ({ userId: index % 2 ? 'alice' : 'bob', units: 5 })));
    expect(decisions.filter((decision) => decision.accepted)).toHaveLength(1);
    await assertCountersMatchRecords(accountId);
  });

  it('processes concurrent duplicates of one requestId exactly once', async () => {
    const { apiKey, accountId } = await setupWorkedExampleAccount(ctx.app);
    const requestId = randomUUID();
    const decisions = await fireConcurrently(apiKey, Array.from({ length: 30 }, () => ({ userId: 'alice', units: 10, requestId })));
    expect(new Set(decisions.map((decision) => decision.usageRecordId)).size).toBe(1);
    expect(decisions.filter((decision) => !decision.idempotentReplay)).toHaveLength(1);
    expect(decisions.every((decision) => decision.accepted && decision.account.consumed === 10)).toBe(true);
    const records = await ctx.pool.query('SELECT count(*) AS n, max(replay_count) AS replays FROM usage_records WHERE account_id = $1', [accountId]);
    expect(records.rows[0]).toEqual({ n: 1, replays: 29 });
    await assertCountersMatchRecords(accountId);
  });

  it('stays consistent while the plan changes during consumption', async () => {
    const { apiKey, accountId, accountPlan } = await setupWorkedExampleAccount(ctx.app, { accountMonthly: 300, accountPerRequest: 100, userMonthly: 10_000, userPerRequest: 20 });
    const users = Array.from({ length: 10 }, (_, index) => `p-${index}`);
    for (const user of users) await registerUser(ctx.app, apiKey, user);
    const allowances = [200, 600, 250, 400, 150, 500];
    const [decisions] = await Promise.all([
      fireConcurrently(apiKey, Array.from({ length: 150 }, (_, index) => ({ userId: users[index % users.length]!, units: 10 }))),
      (async () => {
        for (const monthlyAllowance of allowances) {
          const response = await ctx.app.inject({ method: 'PATCH', url: `/api/v1/plans/${accountPlan.id}`, headers: keyHeaders(apiKey), payload: { monthlyAllowance } });
          expect(response.statusCode).toBe(200);
        }
      })(),
    ]);
    await assertCountersMatchRecords(accountId);
    // Every accepted decision respected the plan version that governed it.
    const violations = await ctx.pool.query(
      `SELECT count(*) AS n FROM usage_records r JOIN plan_versions v ON v.id = r.account_plan_version_id
       WHERE r.account_id = $1 AND r.outcome = 'accepted' AND r.account_consumed_after > v.monthly_allowance`,
      [accountId],
    );
    expect(violations.rows[0].n).toBe(0);
    const versions = await ctx.pool.query('SELECT count(*) AS n FROM plan_versions WHERE plan_id = $1', [accountPlan.id]);
    expect(versions.rows[0].n).toBe(allowances.length + 1);
    expect(decisions.some((decision) => decision.accepted)).toBe(true);
  });
});
