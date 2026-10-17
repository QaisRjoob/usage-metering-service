import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AIInsightInput, AIProvider } from '../../src/Application/Modules/AI/Interfaces/AIProvider';
import { adminHeaders, consumeOk, createTestContext, keyHeaders, setupWorkedExampleAccount, type TestContext } from '../support/testApp';

/** Test double that records what it was given and can be told to fail. */
class RecordingProvider implements AIProvider {
  inputs: AIInsightInput[] = [];
  fail = false;
  async generateUsageInsight(input: AIInsightInput) {
    this.inputs.push(input);
    if (this.fail) throw new Error('upstream exploded with secret details');
    return { provider: 'openai' as const, model: 'test-model', insight: { summary: 'ok', highlights: [], recommendations: [] } };
  }
}

const provider = new RecordingProvider();
let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext({ aiProvider: provider });
});
afterAll(async () => ctx.close());

const ask = (headers: Record<string, string>, question = 'Which users are closest to their limits?') =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/ai/advisor', headers, payload: { question } });

describe('AI advisor', () => {
  it('with an API key, sees only that account', async () => {
    const { apiKey, accountId } = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 10 });
    const response = await ask(keyHeaders(apiKey));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ scope: { kind: 'account', accountId }, provider: 'openai', isMock: false });
    const context = JSON.stringify(provider.inputs.at(-1)?.context);
    expect(context).toContain('alice');
    expect(context).not.toContain(apiKey);
    expect(context).not.toContain('شركة الوثائق التجريبية');
  });

  it('with the admin token, answers across accounts', async () => {
    const response = await ask(adminHeaders);
    expect(response.json()).toMatchObject({ scope: { kind: 'global', accountId: null } });
  });

  it('requires a credential and validates the question', async () => {
    expect((await ask({})).statusCode).toBe(401);
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    expect((await ask(keyHeaders(apiKey), 'x')).statusCode).toBe(400);
  });

  it('maps provider failures to 502 AI_PROVIDER_ERROR without leaking details', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    provider.fail = true;
    const response = await ask(keyHeaders(apiKey));
    provider.fail = false;
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code: 'AI_PROVIDER_ERROR' } });
    expect(response.body).not.toContain('secret');
  });
});
