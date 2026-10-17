#!/usr/bin/env node
/**
 * Reproducible load test (autocannon) against a running API, followed by a correctness check in SQL.
 *
 *   API_URL=http://localhost:3000/api/v1 ADMIN_API_TOKEN=... DATABASE_URL=postgres://... npm run test:perf
 *
 * Options (env): CONNECTIONS (default 50), DURATION seconds per timed scenario (default 20),
 *                SCENARIOS (default hot,spread,limit,history), LABEL (free text stored with results).
 *
 * Scenarios
 *   hot      one account, 200 users, huge allowance  -> every request contends on ONE account counter row
 *   spread   50 accounts x 20 users                   -> load spread across many counter rows
 *   limit    one account with 20,000 units, 4,000 requests of 10 units -> exactly 2,000 must be accepted
 *   history  paginated history reads on the hot account
 * Afterwards: counters must equal the sum of accepted records at both levels, and no counter may
 * exceed its allowance where the allowance never changed.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import autocannon from 'autocannon';
import pg from 'pg';

const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN ?? 'local-dev-admin-token-change-me';
const DATABASE_URL = process.env.DATABASE_URL;
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 50);
const DURATION = Number(process.env.DURATION ?? 20);
const SCENARIOS = (process.env.SCENARIOS ?? 'hot,spread,limit,history').split(',');
const LABEL = process.env.LABEL ?? '';

const url = new URL(API_URL);
const origin = url.origin;
const prefix = url.pathname;

let operatorAccessToken = null;

async function api(method, path, { key, admin, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['x-api-key'] = key;
  if (admin) {
    // Operator endpoints take a JWT: sign in once with the operator token (POST /auth/token).
    operatorAccessToken ??= (await api('POST', '/auth/token', { body: { token: ADMIN_API_TOKEN } })).accessToken;
    headers.authorization = `Bearer ${operatorAccessToken}`;
  }
  const response = await fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(json)}`);
  return json;
}

/** Account on a custom account plan, with `users` users on a custom user plan. */
async function createTenant({ users, accountAllowance, userAllowance = 1_000_000_000, perRequest = 1_000 }) {
  const { apiKey, account } = await api('POST', '/admin/accounts', { admin: true, body: { name: `perf ${randomUUID().slice(0, 8)}` } });
  const accountPlan = await api('POST', '/plans', { key: apiKey, body: { name: 'perf account', scope: 'account', monthlyAllowance: accountAllowance, maxUnitsPerRequest: perRequest } });
  const userPlan = await api('POST', '/plans', { key: apiKey, body: { name: 'perf user', scope: 'user', monthlyAllowance: userAllowance, maxUnitsPerRequest: perRequest } });
  await api('PUT', '/account/plan', { key: apiKey, body: { planId: accountPlan.id } });
  const userIds = [];
  for (let index = 0; index < users; index += 1) {
    const userId = `u${index}`;
    await api('POST', '/users', { key: apiKey, body: { externalUserId: userId, planId: userPlan.id } });
    userIds.push(userId);
  }
  return { apiKey, accountId: account.id, userIds, accountAllowance };
}

const pick = (items) => items[Math.floor(Math.random() * items.length)];

function run(options) {
  return new Promise((resolve, reject) => {
    autocannon({ url: origin, connections: CONNECTIONS, ...options }, (error, result) => (error ? reject(error) : resolve(result)));
  });
}

function consumeRequests(tenants, counters, units = () => 1 + Math.floor(Math.random() * 10)) {
  return [
    {
      method: 'POST',
      path: `${prefix}/usage/consume`,
      setupRequest: (request) => {
        const tenant = pick(tenants);
        return {
          ...request,
          headers: { 'content-type': 'application/json', 'x-api-key': tenant.apiKey },
          body: JSON.stringify({ userId: pick(tenant.userIds), units: units(), requestId: randomUUID() }),
        };
      },
      onResponse: (status, body) => {
        if (status !== 200) return void (counters.errors += 1);
        if (body.includes('"accepted":true')) counters.accepted += 1;
        else counters.rejected += 1;
      },
    },
  ];
}

function summarize(name, result, counters, extra = {}) {
  return {
    scenario: name,
    connections: CONNECTIONS,
    durationSeconds: result.duration,
    requests: result.requests.total,
    throughputRps: Math.round(result.requests.average),
    latencyMs: { p50: result.latency.p50, p90: result.latency.p90, p97_5: result.latency.p97_5, p99: result.latency.p99, max: result.latency.max },
    non2xx: result.non2xx,
    socketErrors: result.errors,
    timeouts: result.timeouts,
    ...counters,
    ...extra,
  };
}

async function verify(pool, tenants, label) {
  const ids = tenants.map((tenant) => tenant.accountId);
  const accountMismatch = await pool.query(
    `SELECT count(*)::int AS n FROM account_usage_counters c
     WHERE c.account_id = ANY($1::uuid[])
       AND c.consumed <> COALESCE((SELECT sum(units_requested) FROM usage_records r WHERE r.account_id = c.account_id AND r.period = c.period AND r.outcome = 'accepted'), 0)`,
    [ids],
  );
  const userMismatch = await pool.query(
    `SELECT count(*)::int AS n FROM user_usage_counters c JOIN users u ON u.id = c.user_id
     WHERE u.account_id = ANY($1::uuid[])
       AND c.consumed <> COALESCE((SELECT sum(units_requested) FROM usage_records r WHERE r.user_id = c.user_id AND r.period = c.period AND r.outcome = 'accepted'), 0)`,
    [ids],
  );
  const overLimit = await pool.query(
    `SELECT count(*)::int AS n FROM account_usage_counters c JOIN accounts a ON a.id = c.account_id
     JOIN plans p ON p.id = a.plan_id JOIN plan_versions v ON v.id = p.current_version_id
     WHERE c.account_id = ANY($1::uuid[]) AND c.consumed > v.monthly_allowance`,
    [ids],
  );
  const result = { accountCounterMismatches: accountMismatch.rows[0].n, userCounterMismatches: userMismatch.rows[0].n, countersOverAllowance: overLimit.rows[0].n };
  console.log(`  correctness (${label}):`, result);
  return result;
}

async function main() {
  const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL, max: 2 }) : null;
  if (!pool) console.warn('DATABASE_URL not set: the SQL correctness check will be skipped.');
  const results = [];
  let hotTenant;

  if (SCENARIOS.includes('hot') || SCENARIOS.includes('history')) {
    console.log('Setting up hot account (200 users)...');
    hotTenant = await createTenant({ users: 200, accountAllowance: 1_000_000_000 });
  }

  if (SCENARIOS.includes('hot')) {
    console.log(`Scenario hot: ${CONNECTIONS} connections, ${DURATION}s`);
    const counters = { accepted: 0, rejected: 0, errors: 0 };
    const result = await run({ duration: DURATION, requests: consumeRequests([hotTenant], counters) });
    results.push(summarize('hot (1 account, 200 users)', result, counters, pool ? { correctness: await verify(pool, [hotTenant], 'hot') } : {}));
  }

  if (SCENARIOS.includes('spread')) {
    console.log('Setting up 50 accounts x 20 users...');
    const tenants = [];
    for (let index = 0; index < 50; index += 1) tenants.push(await createTenant({ users: 20, accountAllowance: 1_000_000_000 }));
    console.log(`Scenario spread: ${CONNECTIONS} connections, ${DURATION}s`);
    const counters = { accepted: 0, rejected: 0, errors: 0 };
    const result = await run({ duration: DURATION, requests: consumeRequests(tenants, counters) });
    results.push(summarize('spread (50 accounts x 20 users)', result, counters, pool ? { correctness: await verify(pool, tenants, 'spread') } : {}));
  }

  if (SCENARIOS.includes('limit')) {
    console.log('Setting up limit account (20,000 units, 100 users)...');
    const tenant = await createTenant({ users: 100, accountAllowance: 20_000 });
    const counters = { accepted: 0, rejected: 0, errors: 0 };
    console.log(`Scenario limit: 4,000 requests x 10 units, ${CONNECTIONS} connections`);
    const result = await run({ amount: 4_000, requests: consumeRequests([tenant], counters, () => 10) });
    const expected = { expectedAccepted: 2_000, acceptedMatchesLimit: counters.accepted === 2_000 };
    results.push(summarize('limit (contended last units)', result, counters, { ...expected, ...(pool ? { correctness: await verify(pool, [tenant], 'limit') } : {}) }));
  }

  if (SCENARIOS.includes('history')) {
    const total = (await api('GET', '/usage?pageSize=1', { key: hotTenant.apiKey })).totalItems;
    const pages = Math.max(1, Math.min(500, Math.floor(total / 20)));
    console.log(`Scenario history: ${total} records on the hot account, random pages 1..${pages}, ${DURATION}s`);
    const counters = { accepted: 0, rejected: 0, errors: 0 };
    const result = await run({
      duration: DURATION,
      requests: [
        {
          method: 'GET',
          setupRequest: (request) => ({ ...request, path: `${prefix}/usage?pageSize=20&page=${1 + Math.floor(Math.random() * pages)}`, headers: { 'x-api-key': hotTenant.apiKey } }),
          onResponse: (status) => {
            if (status !== 200) counters.errors += 1;
          },
        },
      ],
    });
    results.push(summarize(`history (paginated reads over ${total} records)`, result, { errors: counters.errors }));
  }

  const report = {
    label: LABEL,
    date: new Date().toISOString(),
    environment: { node: process.version, platform: `${os.type()} ${os.release()}`, cpus: `${os.cpus().length} x ${os.cpus()[0]?.model}`, memoryGb: Math.round(os.totalmem() / 1e9) },
    apiUrl: API_URL,
    results,
  };
  await mkdir(new URL('./results/', import.meta.url), { recursive: true });
  const file = new URL(`./results/${report.date.replace(/[:.]/g, '-')}.json`, import.meta.url);
  await writeFile(file, JSON.stringify(report, null, 2));
  console.log('\n| Scenario | Requests | Throughput (req/s) | p50 ms | p90 ms | p99 ms | Accepted | Rejected | Errors |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(`| ${r.scenario} | ${r.requests} | ${r.throughputRps} | ${r.latencyMs.p50} | ${r.latencyMs.p90} | ${r.latencyMs.p99} | ${r.accepted ?? '-'} | ${r.rejected ?? '-'} | ${r.errors + r.non2xx} |`);
  }
  console.log(`\nRaw results: ${file.pathname}`);
  await pool?.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
