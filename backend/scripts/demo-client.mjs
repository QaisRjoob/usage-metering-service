#!/usr/bin/env node
/**
 * Command-line example client: a tiny "document processor" that calls the service with an account
 * API key on behalf of its users, exactly like the Client Demo page.
 *
  *   npm run demo:cli                       # runs the guided scenario against the seeded demo account
 *   npm run demo:cli -- process ahmad 10   # one request
 *
 * Environment: API_URL (default http://localhost:3000/api/v1), API_KEY (default: seeded demo key).
 * The scenario switches a user's plan through the account's own API, so run it on a fresh demo
 * account (e.g. right after `docker compose down -v && docker compose up --build`).
 */
import { randomUUID } from 'node:crypto';

const API_URL = (process.env.API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
const API_KEY = process.env.API_KEY ?? 'umk_demo_local_only_do_not_use_in_production';
const PREMIUM_PLAN_ID = '00000000-0000-4000-8000-000000000004';
const BASIC_PLAN_ID = '00000000-0000-4000-8000-000000000003';

async function call(method, path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${payload.error?.code}: ${payload.error?.message}`);
  return payload;
}

function show(label, decision) {
  const outcome = decision.accepted ? 'ACCEPTED' : `REJECTED by ${decision.rejection.rule} (${decision.rejection.level} rule)`;
  const replay = decision.idempotentReplay ? ' [idempotent replay - nothing consumed again]' : '';
  console.log(`\n${label}\n  ${decision.userId} wants ${decision.units} units -> ${outcome}${replay}`);
  if (decision.rejection) console.log(`  ${decision.rejection.message}`);
  console.log(`  account remaining: ${decision.account.remaining}/${decision.account.monthlyAllowance} (${decision.account.planName})`);
  console.log(`  user remaining:    ${decision.user.remaining}/${decision.user.monthlyAllowance} (${decision.user.planName})`);
}

/** The client's only integration point: ask the service before processing a document. */
async function processDocument(userId, units, requestId = randomUUID()) {
  return call('POST', '/usage/consume', { userId, units, requestId });
}

async function scenario() {
  const me = await call('GET', '/account');
  console.log(`Client running as "${me.account.name}" (plan ${me.plan.name}: ${me.quota.remaining} of ${me.quota.monthlyAllowance} units left this month)`);

  show('1. Invoice for ahmad (Basic user)', await processDocument('ahmad', 10));
  show('2. Contract for ahmad - larger than his per-request limit', await processDocument('ahmad', 25));
  show('3. Annual report for sara (Premium) - larger than what the shared account has left', await processDocument('sara', 95));

  console.log('\n-- The account switches ahmad to Premium (configuration change, no client code change) --');
  await call('PUT', '/users/ahmad/plan', { planId: PREMIUM_PLAN_ID });
  show('4. Same contract for ahmad again', await processDocument('ahmad', 25));

  const requestId = randomUUID();
  show('5a. Memo for omar', await processDocument('omar', 5, requestId));
  show('5b. Network retry of the same request (same requestId)', await processDocument('omar', 5, requestId));

  await call('PUT', '/users/ahmad/plan', { planId: BASIC_PLAN_ID });
  console.log('\n(ahmad was switched back to Basic; units already consumed stay counted this month)');
}

const [command, userId, units] = process.argv.slice(2);
try {
  if (command === 'process' && userId && units) show('Single request', await processDocument(userId, Number(units)));
  else await scenario();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
