#!/usr/bin/env node
/**
 * Large history dataset for query-plan checks (not needed by the load test itself).
 *
 *   DATABASE_URL=postgres://... ROWS=500000 npm run perf:seed
 *
 * Creates one account "perf history" with 1,000 users and ROWS accepted usage records spread over
 * the previous 3 months (counters are written to match, so correctness checks still hold), then
 * prints EXPLAIN ANALYZE for the main history and summary queries.
 */
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const ROWS = Number(process.env.ROWS ?? 500_000);
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2, options: '-c TimeZone=UTC' });
const accountId = randomUUID();
const accountPlanId = randomUUID();
const accountVersionId = randomUUID();
const userPlanId = randomUUID();
const userVersionId = randomUUID();
const apiKey = `umk_live_${randomUUID().replace(/-/g, '')}perfhistory`;

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(
    `INSERT INTO accounts (id, name, api_key_hash, api_key_prefix, plan_id) VALUES ($1, 'perf history', $2, $3, '00000000-0000-4000-8000-000000000001')`,
    [accountId, createHash('sha256').update(apiKey).digest('hex'), apiKey.slice(0, 13)],
  );
  for (const [planId, versionId, scope] of [[accountPlanId, accountVersionId, 'account'], [userPlanId, userVersionId, 'user']]) {
    await client.query(`INSERT INTO plans (id, name, scope, is_predefined, owner_account_id, current_version_id) VALUES ($1, $2, $3, false, $4, $5)`, [planId, `perf ${scope}`, scope, accountId, versionId]);
    await client.query(`INSERT INTO plan_versions (id, plan_id, version, monthly_allowance, max_units_per_request) VALUES ($1, $2, 1, 1000000000000, 1000)`, [versionId, planId]);
  }
  await client.query('UPDATE accounts SET plan_id = $2 WHERE id = $1', [accountId, accountPlanId]);
  await client.query(
    `INSERT INTO users (account_id, external_user_id, plan_id) SELECT $1, 'h' || g, $2 FROM generate_series(1, 1000) AS g`,
    [accountId, userPlanId],
  );
  // Records: previous 3 months, accepted, 1-10 units, deterministic spread.
  await client.query(
    `WITH u AS (SELECT id, row_number() OVER (ORDER BY external_user_id) AS n FROM users WHERE account_id = $1),
          g AS (SELECT s, date_trunc('month', now()) - interval '3 months' + (s * interval '1 second' * (7776000.0 / $2)) AS at FROM generate_series(1, $2) AS s)
     INSERT INTO usage_records (id, account_id, user_id, request_id, units_requested, outcome, account_plan_version_id, user_plan_version_id,
                                account_consumed_after, user_consumed_after, period, created_at)
     SELECT gen_random_uuid(), $1, u.id, 'hist-' || g.s, 1 + (g.s % 10), 'accepted', $3, $4, 0, 0, date_trunc('month', g.at)::date, g.at
     FROM g JOIN u ON u.n = 1 + (g.s % 1000)`,
    [accountId, ROWS, accountVersionId, userVersionId],
  );
  await client.query(
    `INSERT INTO account_usage_counters (account_id, period, consumed)
     SELECT account_id, period, sum(units_requested) FROM usage_records WHERE account_id = $1 GROUP BY 1, 2`,
    [accountId],
  );
  await client.query(
    `INSERT INTO user_usage_counters (user_id, period, consumed)
     SELECT user_id, period, sum(units_requested) FROM usage_records WHERE account_id = $1 GROUP BY 1, 2`,
    [accountId],
  );
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
await pool.query('ANALYZE');
console.log(`Inserted ${ROWS} usage records for account ${accountId}. API key (perf only): ${apiKey}`);

const explain = async (title, sql, params) => {
  const { rows } = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${sql}`, params);
  console.log(`\n### ${title}\n${rows.map((row) => row['QUERY PLAN']).join('\n')}`);
};
const prevMonth = (await pool.query(`SELECT (date_trunc('month', now()) - interval '1 month')::date AS d`)).rows[0].d;
await explain('History page 1 (account, newest first)', `SELECT id FROM usage_records r WHERE r.account_id = $1 ORDER BY r.created_at DESC, r.id DESC LIMIT 20 OFFSET 0`, [accountId]);
await explain('History page 200 (deep offset)', `SELECT id FROM usage_records r WHERE r.account_id = $1 ORDER BY r.created_at DESC, r.id DESC LIMIT 20 OFFSET 3980`, [accountId]);
await explain('History, previous month filter', `SELECT id FROM usage_records r WHERE r.account_id = $1 AND r.period = $2 ORDER BY r.created_at DESC, r.id DESC LIMIT 20`, [accountId, prevMonth]);
await explain('History count (account + month)', `SELECT count(*) FROM usage_records r WHERE r.account_id = $1 AND r.period = $2`, [accountId, prevMonth]);
await explain('Daily series (account + month)', `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), sum(units_requested) FROM usage_records r WHERE r.account_id = $1 AND r.period = $2 GROUP BY 1`, [accountId, prevMonth]);
await pool.end();
