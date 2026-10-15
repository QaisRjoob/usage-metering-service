import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/Infrastructure/Database/migrator';
import { seedDemoData, seedPredefinedPlans } from '../../src/Infrastructure/Database/seed/seed';
import { PostgresTransactionManager } from '../../src/Infrastructure/Database/transaction-manager';
import { PREDEFINED_PLAN_IDS, TEST_DEMO_API_KEY, createAccount, createTestContext, type TestContext } from '../support/testApp';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());

describe('migrations and seed', () => {
  it('re-running migrations is a no-op', async () => {
    expect(await runMigrations(ctx.pool)).toEqual([]);
  });

  it('re-running the seed creates no duplicates and keeps existing data', async () => {
    await seedPredefinedPlans(ctx.pool);
    await seedDemoData(ctx.pool, TEST_DEMO_API_KEY);
    await seedPredefinedPlans(ctx.pool);
    const plans = await ctx.pool.query('SELECT count(*) AS n FROM plans WHERE is_predefined');
    const demoUsers = await ctx.pool.query("SELECT count(*) AS n FROM users WHERE account_id = '00000000-0000-4000-8000-0000000000a1'");
    expect(plans.rows[0].n).toBe(4);
    expect(demoUsers.rows[0].n).toBe(3);
  });
});

describe('transactions', () => {
  it('rolls back every write when the unit of work fails', async () => {
    const { account } = await createAccount(ctx.app);
    const transactions = new PostgresTransactionManager(ctx.pool);
    await expect(
      transactions.run(async (repos) => {
        await repos.users.create({ accountId: account.id, externalUserId: 'rolled-back', displayName: null, planId: PREDEFINED_PLAN_IDS.basic, createdAt: new Date() });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const { rows } = await ctx.pool.query("SELECT count(*) AS n FROM users WHERE external_user_id = 'rolled-back'");
    expect(rows[0].n).toBe(0);
  });

  it('database constraints reject invalid counters and units', async () => {
    const { account } = await createAccount(ctx.app);
    await expect(ctx.pool.query("INSERT INTO account_usage_counters (account_id, period, consumed) VALUES ($1, '2026-10-01', -1)", [account.id])).rejects.toThrow();
    await expect(ctx.pool.query("INSERT INTO account_usage_counters (account_id, period) VALUES ($1, '2026-10-15')", [account.id])).rejects.toThrow();
  });
});
