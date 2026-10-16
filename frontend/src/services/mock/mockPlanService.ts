/** MOCK ADAPTER - implements PlanService against the in-memory mock database. */
import { ERROR_CODES, adminListPlansQuerySchema, createPlanSchema, listPlansQuerySchema, updatePlanSchema, type ListPlansParams } from '@/contracts';
import type { PlanService } from '@/services/planService';
import type { MockDatabase, PlanRow } from './mockDatabase';
import { conflict, forbidden, pageOf, requireAccount, requireAdmin, simulate, validate } from './mockRuntime';

/** Search, scope/kind filters and sorting - the same rules as the API's plan lists. */
function filterAndSortPlans(db: MockDatabase, plans: PlanRow[], query: ListPlansParams): PlanRow[] {
  const search = query.search?.toLowerCase();
  const direction = query.order === 'desc' ? -1 : 1;
  const limits = (plan: PlanRow) => db.versionOf(plan);
  return plans
    .filter((plan) => !search || plan.name.toLowerCase().includes(search) || (plan.description ?? '').toLowerCase().includes(search))
    .filter((plan) => !query.scope || plan.scope === query.scope)
    .filter((plan) => !query.kind || (query.kind === 'predefined') === plan.isPredefined)
    .sort((a, b) => {
      if (!query.sort) return Number(b.isPredefined) - Number(a.isPredefined) || a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name);
      const primary =
        query.sort === 'name'
          ? a.name.localeCompare(b.name)
          : query.sort === 'createdAt'
            ? a.createdAt.localeCompare(b.createdAt)
            : query.sort === 'monthlyAllowance'
              ? limits(a).monthlyAllowance - limits(b).monthlyAllowance
              : limits(a).maxUnitsPerRequest - limits(b).maxUnitsPerRequest;
      return (primary || a.id.localeCompare(b.id)) * direction;
    });
}

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
        const visible = [...db.plans.values()].filter((plan) => plan.isPredefined || plan.ownerAccountId === account.id);
        return pageOf(filterAndSortPlans(db, visible, query).map((plan) => db.planDto(plan)), query);
      }),

    listAllPlans: (params) =>
      simulate((db) => {
        requireAdmin();
        const query = validate(adminListPlansQuerySchema, params);
        const all = [...db.plans.values()].filter((plan) => !query.ownerAccountId || plan.ownerAccountId === query.ownerAccountId);
        const accounts = [...db.accounts.values()];
        const users = [...db.users.values()];
        const items = filterAndSortPlans(db, all, query).map((plan) => ({
          ...db.planDto(plan),
          ownerAccountName: plan.ownerAccountId ? (db.accounts.get(plan.ownerAccountId)?.name ?? null) : null,
          assignedAccounts: accounts.filter((account) => account.planId === plan.id).length,
          assignedUsers: users.filter((user) => user.planId === plan.id).length,
        }));
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
