import { randomUUID } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { PREDEFINED_PLAN_IDS, type ConsumeDecision, type CreateAccountResponse, type PlanDetails } from '../../src/contracts';
import { buildApp } from '../../src/app';
import type { Clock } from '../../src/Application/Common/Clock';
import type { AIProvider } from '../../src/Application/Modules/AI/Interfaces/AIProvider';
import { loadConfig } from '../../src/config/env';
import { createContainer, type Container } from '../../src/container';
import { createPool, type Pool } from '../../src/Infrastructure/Database/postgres';
import { TEST_DATABASE_URL } from './testDatabase';

export const TEST_ADMIN_TOKEN = 'test-admin-token-0123456789';
export const TEST_DEMO_API_KEY = 'umk_demo_test_key_for_integration_tests';
export const TEST_JWT_SECRET = 'test-jwt-secret-for-integration-tests-0123456789';
export { PREDEFINED_PLAN_IDS };

/** A clock tests can move, e.g. across a UTC month boundary. Defaults to real time. */
export class TestClock implements Clock {
  private fixed: Date | null = null;
  now(): Date {
    return this.fixed ? new Date(this.fixed) : new Date();
  }
  set(date: Date | string): void {
    this.fixed = new Date(date);
  }
  reset(): void {
    this.fixed = null;
  }
}

export interface TestContext {
  app: FastifyInstance;
  pool: Pool;
  clock: TestClock;
  container: Container;
  close: () => Promise<void>;
}

export async function createTestContext(options: { aiProvider?: AIProvider; poolSize?: number; env?: Record<string, string> } = {}): Promise<TestContext> {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    ADMIN_API_TOKEN: TEST_ADMIN_TOKEN,
    DEMO_API_KEY: TEST_DEMO_API_KEY,
    AI_PROVIDER: 'mock',
    LOG_LEVEL: 'silent',
    AI_RATE_LIMIT_PER_WINDOW: '1000',
    // Many tests send wrong credentials on purpose; security.test.ts checks the real limit.
    AUTH_FAILURE_LIMIT_PER_MINUTE: '100000',
    JWT_SECRET: TEST_JWT_SECRET,
    ...options.env,
  });
  const pool = createPool(TEST_DATABASE_URL, options.poolSize ?? 20);
  const clock = new TestClock();
  const container = createContainer({ config, pool, clock, aiProvider: options.aiProvider });
  const app = await buildApp(container, { logger: false });
  await app.ready();
  // Operator routes need an operator JWT: sign in once with the operator token (same flow as the UI).
  const operator = await container.auth.issue.execute(TEST_ADMIN_TOKEN);
  adminHeaders.authorization = `Bearer ${operator.response.accessToken}`;
  return {
    app,
    pool,
    clock,
    container,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

// ---------------------------------------------------------------- request helpers

/** Operator request headers: a JWT access token, set by createTestContext (POST /auth/token flow). */
export const adminHeaders: { authorization: string } = { authorization: '' };
export const operatorToken = (): string => adminHeaders.authorization.replace(/^Bearer /, '');
export const keyHeaders = (apiKey: string) => ({ 'x-api-key': apiKey });

export function json<T>(response: LightMyRequestResponse): T {
  return response.json() as T;
}

export async function createAccount(app: FastifyInstance, planId: string = PREDEFINED_PLAN_IDS.starter): Promise<CreateAccountResponse> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/admin/accounts', headers: adminHeaders, payload: { name: `Test ${randomUUID().slice(0, 8)}`, planId } });
  if (response.statusCode !== 201) throw new Error(`createAccount failed: ${response.statusCode} ${response.body}`);
  return json(response);
}

export async function createPlan(
  app: FastifyInstance,
  apiKey: string,
  body: { scope: 'account' | 'user'; monthlyAllowance: number; maxUnitsPerRequest: number; name?: string },
): Promise<PlanDetails> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/plans',
    headers: keyHeaders(apiKey),
    payload: { name: body.name ?? `Plan ${randomUUID().slice(0, 8)}`, scope: body.scope, monthlyAllowance: body.monthlyAllowance, maxUnitsPerRequest: body.maxUnitsPerRequest },
  });
  if (response.statusCode !== 201) throw new Error(`createPlan failed: ${response.statusCode} ${response.body}`);
  return json(response);
}

export async function assignAccountPlan(app: FastifyInstance, apiKey: string, planId: string): Promise<void> {
  const response = await app.inject({ method: 'PUT', url: '/api/v1/account/plan', headers: keyHeaders(apiKey), payload: { planId } });
  if (response.statusCode !== 200) throw new Error(`assignAccountPlan failed: ${response.statusCode} ${response.body}`);
}

export async function registerUser(app: FastifyInstance, apiKey: string, externalUserId: string, planId?: string): Promise<void> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/users', headers: keyHeaders(apiKey), payload: { externalUserId, ...(planId ? { planId } : {}) } });
  if (response.statusCode !== 201) throw new Error(`registerUser failed: ${response.statusCode} ${response.body}`);
}

export function consume(app: FastifyInstance, apiKey: string, body: { userId: string; units: number; requestId?: string }) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/usage/consume',
    headers: keyHeaders(apiKey),
    payload: { requestId: body.requestId ?? randomUUID(), userId: body.userId, units: body.units },
  });
}

export async function consumeOk(app: FastifyInstance, apiKey: string, body: { userId: string; units: number; requestId?: string }): Promise<ConsumeDecision> {
  const response = await consume(app, apiKey, body);
  if (response.statusCode !== 200) throw new Error(`consume failed: ${response.statusCode} ${response.body}`);
  return json(response);
}

/**
 * The brief's worked-example setup: an account plan of 10,000/month and 100/request, a user plan of
 * 1,000/month and 20/request, and users "alice" and "bob" on that user plan.
 */
export async function setupWorkedExampleAccount(app: FastifyInstance, limits = { accountMonthly: 10_000, accountPerRequest: 100, userMonthly: 1_000, userPerRequest: 20 }) {
  const { apiKey, account } = await createAccount(app);
  const accountPlan = await createPlan(app, apiKey, { scope: 'account', monthlyAllowance: limits.accountMonthly, maxUnitsPerRequest: limits.accountPerRequest });
  const userPlan = await createPlan(app, apiKey, { scope: 'user', monthlyAllowance: limits.userMonthly, maxUnitsPerRequest: limits.userPerRequest });
  await assignAccountPlan(app, apiKey, accountPlan.id);
  await registerUser(app, apiKey, 'alice', userPlan.id);
  await registerUser(app, apiKey, 'bob', userPlan.id);
  return { apiKey, accountId: account.id, accountPlan, userPlan };
}
