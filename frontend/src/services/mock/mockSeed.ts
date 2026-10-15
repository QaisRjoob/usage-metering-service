/**
 * MOCK DATA - deterministic seed for the in-browser mock database.
 *
 * Mirrors what the backend seeds: the four predefined plans, plus the demo account used by the
 * Client Demo (custom shared plan of 100 units/month, users on Basic and Premium). Other accounts
 * and their history are generated with a fixed-seed PRNG so screenshots and tests are stable.
 */
import { PREDEFINED_PLAN_IDS } from '@/contracts';
import { addMonths, daysInMonth, monthKeyOf, monthStart } from '@/utils/dateUtils';
import type { MockDatabase } from './mockDatabase';

export { PREDEFINED_PLAN_IDS };

export const DEMO_ACCOUNT_ID = '00000000-0000-4000-8000-0000000000a1';
export const DEMO_PLAN_ID = '00000000-0000-4000-8000-0000000000d1';
export const DEMO_API_KEY = 'umk_demo_local_only_do_not_use_in_production';
/** Mock-mode operator token. Only accepted by the mock adapter; the real API reads ADMIN_API_TOKEN. */
export const MOCK_ADMIN_TOKEN = 'mock-admin-token';

/** Small deterministic PRNG (mulberry32). */
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
  };
}

const COMPANY_NAMES = [
  'Acme Legal',
  'Northwind Papers',
  'Globex Archive',
  'Initech Scans',
  'Umbrella Forms',
  'Stark Contracts',
  'Wayne Records',
  'Hooli Docs',
  'Vandelay Imports',
  'Soylent Filings',
  'Cyberdyne Ledger',
  'Tyrell Paperworks',
];

const FIRST_NAMES = ['ana', 'ben', 'chen', 'dara', 'eli', 'fatima', 'gus', 'hana', 'ivan', 'jade', 'kofi', 'lina', 'mo', 'nora', 'omar'];

/**
 * Share of the monthly allowance each generated account would use over a full month. Values above
 * 1 exhaust the shared allowance before month end, producing account-level rejections.
 */
const UTILIZATION_TARGETS = [1.7, 2.4, 0.42, 0.12, 1.9, 0.65, 0.3, 0.5, 0.95, 0.2, 0.75, 0.05];
const MAX_REQUESTS_PER_DAY = 60;

export function seedMockDatabase(db: MockDatabase): void {
  const now = db.now();
  const currentMonth = monthKeyOf(now);
  const historyStart = monthStart(addMonths(currentMonth, -2));
  const createdAt = new Date(historyStart.getTime() - 14 * 86_400_000);

  // Predefined plans (read-only, no owner).
  db.createPlan({ id: PREDEFINED_PLAN_IDS.starter, name: 'Starter', description: 'Predefined account plan for small teams.', scope: 'account', isPredefined: true, ownerAccountId: null, monthlyAllowance: 10_000, maxUnitsPerRequest: 100, at: createdAt });
  db.createPlan({ id: PREDEFINED_PLAN_IDS.pro, name: 'Pro', description: 'Predefined account plan for high-volume applications.', scope: 'account', isPredefined: true, ownerAccountId: null, monthlyAllowance: 100_000, maxUnitsPerRequest: 500, at: createdAt });
  db.createPlan({ id: PREDEFINED_PLAN_IDS.basic, name: 'Basic', description: 'Predefined user plan.', scope: 'user', isPredefined: true, ownerAccountId: null, monthlyAllowance: 1_000, maxUnitsPerRequest: 20, at: createdAt });
  db.createPlan({ id: PREDEFINED_PLAN_IDS.premium, name: 'Premium', description: 'Predefined user plan with larger limits.', scope: 'user', isPredefined: true, ownerAccountId: null, monthlyAllowance: 10_000, maxUnitsPerRequest: 200, at: createdAt });

  // Demo account for the Client Demo scenario. Current month starts empty.
  db.createPlan({ id: DEMO_PLAN_ID, name: 'Demo Shared Pool', description: 'Small custom account plan so the shared limit is easy to reach in the demo.', scope: 'account', isPredefined: false, ownerAccountId: DEMO_ACCOUNT_ID, monthlyAllowance: 100, maxUnitsPerRequest: 100, at: createdAt });
  const { row: demo } = db.createAccount({ id: DEMO_ACCOUNT_ID, name: 'Demo Docs Inc', planId: DEMO_PLAN_ID, apiKey: DEMO_API_KEY, at: createdAt });
  const alice = db.createUser({ accountId: demo.id, externalUserId: 'alice', displayName: 'Alice (Basic)', planId: PREDEFINED_PLAN_IDS.basic, at: createdAt });
  const bob = db.createUser({ accountId: demo.id, externalUserId: 'bob', displayName: 'Bob (Premium)', planId: PREDEFINED_PLAN_IDS.premium, at: createdAt });
  db.createUser({ accountId: demo.id, externalUserId: 'carol', displayName: 'Carol (Basic)', planId: PREDEFINED_PLAN_IDS.basic, at: createdAt });

  const random = createRandom(20261012);
  const generated = COMPANY_NAMES.map((name, index) => {
    const isPro = index % 4 === 3;
    const { row } = db.createAccount({
      name,
      planId: isPro ? PREDEFINED_PLAN_IDS.pro : PREDEFINED_PLAN_IDS.starter,
      at: new Date(createdAt.getTime() + index * 3_600_000),
    });
    const userCount = random.int(3, 12);
    const users = Array.from({ length: userCount }, (_, userIndex) =>
      db.createUser({
        accountId: row.id,
        externalUserId: `${FIRST_NAMES[userIndex % FIRST_NAMES.length]}.${index + 1}${userIndex >= FIRST_NAMES.length ? userIndex : ''}`,
        displayName: null,
        planId: userIndex % 3 === 0 ? PREDEFINED_PLAN_IDS.basic : PREDEFINED_PLAN_IDS.premium,
        at: createdAt,
      }),
    );
    return {
      account: row,
      users,
      target: UTILIZATION_TARGETS[index] ?? 0.5,
      allowance: isPro ? 100_000 : 10_000,
      accountMaxPerRequest: isPro ? 500 : 100,
    };
  });

  // Generate history chronologically so per-month counters and rule checks behave like real traffic.
  let sequence = 0;
  for (let monthOffset = -2; monthOffset <= 0; monthOffset += 1) {
    const month = addMonths(currentMonth, monthOffset);
    const lastDay = monthOffset === 0 ? now.getUTCDate() : daysInMonth(month);
    for (let day = 1; day <= lastDay; day += 1) {
      const dayStart = Date.UTC(monthStart(month).getUTCFullYear(), monthStart(month).getUTCMonth(), day);
      const dayEnd = Math.min(dayStart + 86_400_000 - 1, now.getTime());
      for (const entry of generated) {
        // Send requests until the day's (jittered) volume is reached. Most requests fit both
        // per-request limits; ~5% are oversized and get rejected by a per-request rule.
        const dailyTarget = ((entry.allowance * entry.target) / daysInMonth(month)) * (0.6 + random.next() * 0.8);
        let requested = 0;
        for (let index = 0; index < MAX_REQUESTS_PER_DAY && requested < dailyTarget; index += 1) {
          const user = random.pick(entry.users);
          const userMax = user.planId === PREDEFINED_PLAN_IDS.basic ? 20 : 200;
          const cap = Math.min(userMax, entry.accountMaxPerRequest);
          const units = random.next() < 0.05 ? cap + random.int(1, 30) : random.int(1, cap);
          const at = new Date(dayStart + Math.floor(random.next() * Math.max(1, dayEnd - dayStart)));
          sequence += 1;
          db.consume(entry.account, { userId: user.externalUserId, units, requestId: `seed-${sequence}` }, at);
          requested += units;
        }
      }
      // A little demo-account history in previous months only.
      if (monthOffset < 0 && day % 6 === 0) {
        const user = day % 12 === 0 ? bob : alice;
        sequence += 1;
        db.consume(demo, { userId: user.externalUserId, units: user === bob ? 30 : 12, requestId: `seed-${sequence}` }, new Date(dayStart + 36_000_000));
      }
    }
  }
}
