/** MOCK ADAPTER - implements UserService against the in-memory mock database. */
import { ERROR_CODES, assignPlanSchema, createUserSchema, listUsersQuerySchema, monthSchema } from '@/contracts';
import type { UserDetails } from '@/models/user';
import type { UserService } from '@/services/userService';
import type { AccountRow, MockDatabase, UserRow } from './mockDatabase';
import { PREDEFINED_PLAN_IDS } from './mockSeed';
import { conflict, filteredUsers, pageOf, requireAccount, simulate, unprocessable, validate } from './mockRuntime';

function userDetails(db: MockDatabase, account: AccountRow, user: UserRow): UserDetails {
  const period = db.currentPeriod();
  return {
    user: db.userSummary(user),
    plan: db.planDto(db.plans.get(user.planId)!),
    quota: db.userSnapshot(user, period),
    accountQuota: db.accountSnapshot(account, period),
  };
}

export function createMockUserService(): UserService {
  return {
    listUsers: (params) =>
      simulate((db) => {
        const account = requireAccount(db);
        const query = validate(listUsersQuerySchema, params);
        return pageOf(filteredUsers(db, account.id, query, query.month ?? db.currentPeriod()), query);
      }),

    getUser: (userId) =>
      simulate((db) => {
        const account = requireAccount(db);
        return userDetails(db, account, db.getUser(account.id, userId));
      }),

    createUser: (request) =>
      simulate((db) => {
        const account = requireAccount(db);
        const input = validate(createUserSchema, request);
        if (db.findUser(account.id, input.externalUserId)) {
          throw conflict(ERROR_CODES.USER_ALREADY_EXISTS, `User "${input.externalUserId}" already exists in this account.`);
        }
        const plan = db.visiblePlan(input.planId ?? PREDEFINED_PLAN_IDS.basic, account.id);
        if (plan.scope !== 'user') throw unprocessable(ERROR_CODES.PLAN_SCOPE_MISMATCH, 'An account plan cannot be assigned to a user.');
        const user = db.createUser({ accountId: account.id, externalUserId: input.externalUserId, displayName: input.displayName ?? null, planId: plan.id });
        return db.userWithQuota(user, db.currentPeriod());
      }),

    assignUserPlan: (userId, planId) =>
      simulate((db) => {
        const account = requireAccount(db);
        const user = db.getUser(account.id, userId);
        const input = validate(assignPlanSchema, { planId });
        const plan = db.visiblePlan(input.planId, account.id);
        if (plan.scope !== 'user') throw unprocessable(ERROR_CODES.PLAN_SCOPE_MISMATCH, 'An account plan cannot be assigned to a user.');
        // Switching plans keeps the units already consumed this month (counters are per user and month).
        user.planId = plan.id;
        return userDetails(db, account, user);
      }),

    getUserUsageSummary: (userId, month) =>
      simulate((db) => {
        const account = requireAccount(db);
        const period = month === undefined ? db.currentPeriod() : validate(monthSchema, month);
        return db.userUsageSummary(account, db.getUser(account.id, userId), period);
      }),
  };
}
