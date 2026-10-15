/** MOCK ADAPTER - implements PlanService against the in-memory mock database. */
import { ERROR_CODES, createPlanSchema, listPlansQuerySchema, updatePlanSchema } from '@/contracts';
import type { PlanService } from '@/services/planService';
import type { MockDatabase } from './mockDatabase';
import { conflict, forbidden, pageOf, requireAccount, simulate, validate } from './mockRuntime';

function assertNameAvailable(db: MockDatabase, accountId: string, name: string, exceptPlanId?: string): void {
  const taken = [...db.plans.values()].some(
    (plan) => plan.id !== exceptPlanId && plan.ownerAccountId === accountId && plan.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw conflict(ERROR_CODES.PLAN_NAME_TAKEN, `A custom plan named "${name}" already exists in this account.`);
}

export function createMockPlanService(): PlanService {
  return {
    listPlans: (params) =>
      simulate((db) => {
        const account = requireAccount(db);
        const query = validate(listPlansQuerySchema, params);
        const items = [...db.plans.values()]
          .filter((plan) => plan.isPredefined || plan.ownerAccountId === account.id)
          .filter((plan) => !query.scope || plan.scope === query.scope)
          .filter((plan) => !query.kind || (query.kind === 'predefined') === plan.isPredefined)
          .sort((a, b) => Number(b.isPredefined) - Number(a.isPredefined) || a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name))
          .map((plan) => db.planDto(plan));
        return pageOf(items, query);
      }),

    getPlan: (planId) =>
      simulate((db) => {
        const account = requireAccount(db);
        return db.planDetailsDto(db.visiblePlan(planId, account.id), account.id);
      }),

    createPlan: (request) =>
      simulate((db) => {
        const account = requireAccount(db);
        const input = validate(createPlanSchema, request);
        assertNameAvailable(db, account.id, input.name);
        const plan = db.createPlan({ ...input, description: input.description ?? null, isPredefined: false, ownerAccountId: account.id });
        return db.planDetailsDto(plan, account.id);
      }),

    updatePlan: (planId, request) =>
      simulate((db) => {
        const account = requireAccount(db);
        const plan = db.visiblePlan(planId, account.id);
        if (plan.isPredefined) throw forbidden(ERROR_CODES.PLAN_READ_ONLY, 'Predefined plans are read-only. Create a custom plan instead.');
        const input = validate(updatePlanSchema, request);
        if (input.name) assertNameAvailable(db, account.id, input.name, plan.id);
        return db.planDetailsDto(db.updatePlan(plan, input), account.id);
      }),
  };
}
