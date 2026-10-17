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

describe('integrity constraints', () => {
  /** Runs one statement in a transaction that is always rolled back; resolves to the error, if any. */
  async function violation(sql: string, params: unknown[] = []): Promise<string | null> {
    const client = await ctx.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql, params);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      return null;
    } catch (error) {
      return (error as { constraint?: string; message: string }).constraint ?? (error as Error).message;
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  it("rejects a plan whose current version belongs to another plan", async () => {
    const { rows } = await ctx.pool.query('SELECT current_version_id FROM plans WHERE id = $1', [PREDEFINED_PLAN_IDS.pro]);
    expect(await violation('UPDATE plans SET current_version_id = $1 WHERE id = $2', [rows[0].current_version_id, PREDEFINED_PLAN_IDS.starter])).toBe('plans_current_version_fk');
  });

  it("rejects a usage record whose user belongs to another account", async () => {
    const a = await createAccount(ctx.app);
    const b = await createAccount(ctx.app);
    const user = await ctx.pool.query(
      "INSERT INTO users (account_id, external_user_id, plan_id) VALUES ($1, 'integrity-user', $2) RETURNING id",
      [a.account.id, PREDEFINED_PLAN_IDS.basic],
    );
    const versions = await ctx.pool.query('SELECT current_version_id AS id FROM plans WHERE id IN ($1, $2) ORDER BY scope', [PREDEFINED_PLAN_IDS.starter, PREDEFINED_PLAN_IDS.basic]);
    const insert = (accountId: string, period: string) =>
      violation(
        `INSERT INTO usage_records (id, account_id, user_id, request_id, units_requested, outcome, account_plan_version_id, user_plan_version_id,
           account_consumed_after, user_consumed_after, period, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'r1', 1, 'accepted', $3, $4, 1, 1, $5, '2026-10-15T12:00:00Z')`,
        [accountId, user.rows[0].id, versions.rows[0].id, versions.rows[1].id, period],
      );
    expect(await insert(b.account.id, '2026-10-01')).toBe('usage_records_user_account_fk');
    // The period must be the UTC month of created_at.
    expect(await insert(a.account.id, '2026-09-01')).toBe('usage_records_period_matches_created');
    expect(await insert(a.account.id, '2026-10-01')).toBeNull();
  });

  it('rejects sign-up requests for a user plan, with an upper-case email, or reusing an account', async () => {
    const insert = (planId: string, email: string) =>
      violation(
        `INSERT INTO signup_requests (company_name, contact_name, contact_email, requested_plan_id, claim_code_hash, submitted_at)
         VALUES ('Integrity Co', 'Ann', $2, $1, repeat('a', 64), now())`,
        [planId, email],
      );
    expect(await insert(PREDEFINED_PLAN_IDS.basic, 'ann@example.com')).toBe('signup_requests_plan_fk');
    expect(await insert(PREDEFINED_PLAN_IDS.starter, 'Ann@Example.com')).toBe('signup_requests_email_lowercase');
    expect(await insert(PREDEFINED_PLAN_IDS.starter, 'ann@example.com')).toBeNull();
  });

  it('accepts only well-formed key hashes and prefixes', async () => {
    const { account } = await createAccount(ctx.app);
    expect(await violation("UPDATE accounts SET api_key_hash = 'plain-text-key' WHERE id = $1", [account.id])).toBe('accounts_api_key_hash_shape');
    expect(await violation("UPDATE accounts SET api_key_prefix = 'umk_live_secret_tail' WHERE id = $1", [account.id])).toBe('accounts_api_key_prefix_shape');
  });
});
