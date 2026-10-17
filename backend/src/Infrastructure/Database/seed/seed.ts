import { PREDEFINED_PLAN_IDS } from '../../../contracts';
import { apiKeyPrefixOf, hashApiKey } from '../../../Domain/Accounts/ApiKey';
import type { Pool, PoolClient } from '../postgres';

/** Fixed ids so the seed is idempotent and documentation can refer to them. */
export const DEMO_ACCOUNT_ID = '00000000-0000-4000-8000-0000000000a1';
export const DEMO_PLAN_ID = '00000000-0000-4000-8000-0000000000d1';

interface SeedPlan {
  id: string;
  versionId: string;
  name: string;
  description: string;
  scope: 'account' | 'user';
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
}

/** Predefined plans (README "Predefined plans"). Seeded at every startup; never overwritten. */
export const PREDEFINED_PLANS: SeedPlan[] = [
  { id: PREDEFINED_PLAN_IDS.starter, versionId: '00000000-0000-4000-8000-000000000101', name: 'Starter', description: 'Predefined account plan for small teams.', scope: 'account', monthlyAllowance: 10_000, maxUnitsPerRequest: 100 },
  { id: PREDEFINED_PLAN_IDS.pro, versionId: '00000000-0000-4000-8000-000000000102', name: 'Pro', description: 'Predefined account plan for high-volume applications.', scope: 'account', monthlyAllowance: 100_000, maxUnitsPerRequest: 500 },
  { id: PREDEFINED_PLAN_IDS.basic, versionId: '00000000-0000-4000-8000-000000000103', name: 'Basic', description: 'Predefined user plan.', scope: 'user', monthlyAllowance: 1_000, maxUnitsPerRequest: 20 },
  { id: PREDEFINED_PLAN_IDS.premium, versionId: '00000000-0000-4000-8000-000000000104', name: 'Premium', description: 'Predefined user plan with larger limits.', scope: 'user', monthlyAllowance: 10_000, maxUnitsPerRequest: 200 },
];

async function insertPlan(client: PoolClient, plan: SeedPlan, ownerAccountId: string | null): Promise<void> {
  await client.query(
    `INSERT INTO plans (id, name, description, scope, is_predefined, owner_account_id, current_version_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
    [plan.id, plan.name, plan.description, plan.scope, ownerAccountId === null, ownerAccountId, plan.versionId],
  );
  await client.query(
    `INSERT INTO plan_versions (id, plan_id, version, monthly_allowance, max_units_per_request)
     VALUES ($1, $2, 1, $3, $4) ON CONFLICT (id) DO NOTHING`,
    [plan.versionId, plan.id, plan.monthlyAllowance, plan.maxUnitsPerRequest],
  );
}

async function inTransaction(pool: Pool, work: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await work(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function seedPredefinedPlans(pool: Pool): Promise<void> {
  await inTransaction(pool, async (client) => {
    for (const plan of PREDEFINED_PLANS) await insertPlan(client, plan, null);
  });
}

/**
 * Demo data for the Client Demo (local use only): "شركة الوثائق التجريبية" (Demo Docs Co.) on a
 * small custom account plan (100 units/month, 100/request) with ahmad (Basic), sara (Premium) and
 * omar (Basic). Names are Arabic; user ids stay ASCII because clients send them in URLs.
 * Idempotent: existing rows are left untouched.
 */
export async function seedDemoData(pool: Pool, demoApiKey: string): Promise<void> {
  await inTransaction(pool, async (client) => {
    // The custom plan and the account reference each other; the plan FK to its version is deferred.
    const created = await client.query(
      `INSERT INTO accounts (id, name, api_key_hash, api_key_prefix, plan_id)
       VALUES ($1, 'شركة الوثائق التجريبية', $2, $3, $4) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [DEMO_ACCOUNT_ID, hashApiKey(demoApiKey), apiKeyPrefixOf(demoApiKey), PREDEFINED_PLAN_IDS.starter],
    );
    await insertPlan(
      client,
      {
        id: DEMO_PLAN_ID,
        versionId: '00000000-0000-4000-8000-0000000001d1',
        name: 'الرصيد المشترك التجريبي',
        description: 'باقة حساب مخصصة صغيرة حتى يسهل الوصول إلى الحد المشترك في العرض التجريبي.',
        scope: 'account',
        monthlyAllowance: 100,
        maxUnitsPerRequest: 100,
      },
      DEMO_ACCOUNT_ID,
    );
    // Only a freshly created demo account is moved onto its custom plan; later plan changes are kept.
    if (created.rowCount === 1) await client.query('UPDATE accounts SET plan_id = $2 WHERE id = $1', [DEMO_ACCOUNT_ID, DEMO_PLAN_ID]);
    const users: [string, string, string][] = [
      ['ahmad', 'أحمد الخطيب', PREDEFINED_PLAN_IDS.basic],
      ['sara', 'سارة النجار', PREDEFINED_PLAN_IDS.premium],
      ['omar', 'عمر حداد', PREDEFINED_PLAN_IDS.basic],
    ];
    for (const [externalUserId, displayName, planId] of users) {
      await client.query(
        `INSERT INTO users (account_id, external_user_id, display_name, plan_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT (account_id, external_user_id) DO NOTHING`,
        [DEMO_ACCOUNT_ID, externalUserId, displayName, planId],
      );
    }
  });
}
