#!/usr/bin/env node
/**
 * Fills a running stack with sample data (Arabic company and person names) through the public API,
 * so every operator page has something to show: three companies with users, a custom plan,
 * accepted and rejected requests, and sign-up requests waiting for / refused by the operator.
 *
 *   npm run demo:populate
 *
 * Environment: API_URL (default http://localhost:3000/api/v1), ADMIN_API_TOKEN (default: the
 * local demo token; exchanged for an operator JWT at POST /auth/token). Run it once on a fresh database (docker compose down -v && docker compose up --build);
 * it stops without changes if the sample companies already exist.
 */
import { randomUUID } from 'node:crypto';

const API_URL = (process.env.API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? 'local-admin-token-change-me';
const PLANS = {
  starter: '00000000-0000-4000-8000-000000000001',
  pro: '00000000-0000-4000-8000-000000000002',
  basic: '00000000-0000-4000-8000-000000000003',
  premium: '00000000-0000-4000-8000-000000000004',
};

let operatorAccessToken = null;

async function call(method, path, { body, apiKey, admin = false } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  if (admin) headers.authorization = `Bearer ${operatorAccessToken}`;
  const response = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${payload.error?.code ?? ''} ${payload.error?.message ?? ''}`);
  return payload;
}

/**
 * Each company: plan, users [id, Arabic name, plan], and requests [userId, units] sent in order.
 * Basic users may send at most 20 units per request, so a 35-unit request is rejected by the user's
 * own limit; everything else fits.
 */
const COMPANIES = [
  {
    name: 'مكتب العدل للمحاماة',
    plan: PLANS.pro,
    users: [
      ['layla', 'ليلى منصور', PLANS.basic],
      ['yousef', 'يوسف العلي', PLANS.premium],
      ['khaled', 'خالد الشريف', PLANS.premium],
      ['mariam', 'مريم عودة', PLANS.basic],
    ],
    requests: [['layla', 15], ['yousef', 120], ['khaled', 60], ['layla', 35], ['mariam', 10], ['yousef', 90], ['mariam', 35], ['khaled', 45]],
  },
  {
    name: 'دار الشمال للطباعة والنشر',
    plan: PLANS.starter,
    users: [
      ['huda', 'هدى سلامة', PLANS.basic],
      ['ali', 'علي القاسم', PLANS.premium],
      ['noor', 'نور الزعبي', PLANS.basic],
    ],
    requests: [['huda', 12], ['ali', 80], ['noor', 18], ['huda', 35], ['ali', 95], ['noor', 5]],
  },
  {
    name: 'مركز الخليج للأرشفة الرقمية',
    plan: PLANS.starter,
    customUserPlan: { name: 'باقة الأرشيف الموسعة', description: 'باقة مستخدم مخصصة لفريق الأرشفة: رصيد شهري أكبر.', monthlyAllowance: 5_000, maxUnitsPerRequest: 100 },
    users: [
      ['rami', 'رامي عيسى', 'custom'],
      ['dana', 'دانة البرغوثي', PLANS.basic],
      ['tariq', 'طارق الحسيني', 'custom'],
    ],
    requests: [['rami', 70], ['dana', 20], ['tariq', 100], ['dana', 35], ['rami', 40], ['tariq', 25]],
  },
];

const SIGNUPS = [
  { companyName: 'مطبعة الزيتون', contactName: 'رنا العلي', contactEmail: 'rana@zaytoon.test', planId: PLANS.starter, useCase: 'أرشفة فواتير المطبعة وعقود العملاء، حوالي 15 مستخدماً.' },
  {
    companyName: 'دار النشر الحديثة',
    contactName: 'سامي حداد',
    contactEmail: 'sami@hadith.test',
    planId: PLANS.pro,
    useCase: 'تحويل المخطوطات إلى نصوص قابلة للبحث.',
    rejectWith: 'يرجى التقديم باستخدام البريد الإلكتروني الرسمي للشركة.',
  },
];

async function main() {
  // Operator endpoints take a JWT: exchange the operator token for one (POST /auth/token).
  operatorAccessToken = (await call('POST', '/auth/token', { body: { token: ADMIN_TOKEN } })).accessToken;
  const existing = await call('GET', `/admin/accounts?search=${encodeURIComponent(COMPANIES[0].name)}`, { admin: true });
  if (existing.totalItems > 0) {
    console.log('Sample data is already there; nothing to do. (Reset with: docker compose down -v && docker compose up --build)');
    return;
  }

  for (const company of COMPANIES) {
    const { account, apiKey } = await call('POST', '/admin/accounts', { admin: true, body: { name: company.name, planId: company.plan } });
    let customPlanId = null;
    if (company.customUserPlan) {
      customPlanId = (await call('POST', '/plans', { apiKey, body: { ...company.customUserPlan, scope: 'user' } })).id;
    }
    for (const [externalUserId, displayName, plan] of company.users) {
      await call('POST', '/users', { apiKey, body: { externalUserId, displayName, planId: plan === 'custom' ? customPlanId : plan } });
    }
    let accepted = 0;
    for (const [userId, units] of company.requests) {
      const decision = await call('POST', '/usage/consume', { apiKey, body: { userId, units, requestId: `sample-${randomUUID()}` } });
      if (decision.accepted) accepted += 1;
    }
    console.log(`${company.name}: ${company.users.length} users, ${accepted} accepted / ${company.requests.length - accepted} rejected requests (key ${account.apiKeyPrefix}…)`);
  }

  for (const { rejectWith, ...request } of SIGNUPS) {
    const created = await call('POST', '/signup-requests', { body: request });
    if (rejectWith) await call('POST', `/admin/signup-requests/${created.requestId}/reject`, { admin: true, body: { note: rejectWith } });
    console.log(`Sign-up request: ${request.companyName} (${rejectWith ? 'denied' : 'waiting for the operator'})`);
  }
  console.log('\nDone. Open http://localhost:8080 and sign in with the operator token.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
