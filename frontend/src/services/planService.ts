import type { PaginatedResponse } from '@/models/pagination';
import type { AdminListPlansParams, AdminPlanListItem, CreatePlanRequest, ListPlansParams, Plan, PlanDetails, UpdatePlanRequest } from '@/models/plan';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

/** Account scope: predefined plans plus the connected account's own custom plans. */
export interface PlanService {
  listPlans(params: ListPlansParams): Promise<PaginatedResponse<Plan>>;
  getPlan(planId: string): Promise<PlanDetails>;
  createPlan(request: CreatePlanRequest): Promise<PlanDetails>;
  /** Limit changes create a new plan version; predefined plans answer 403 PLAN_READ_ONLY. */
  updatePlan(planId: string, request: UpdatePlanRequest): Promise<PlanDetails>;
  /** Operator scope: the whole catalogue, including every account's custom plans. */
  listAllPlans(params: AdminListPlansParams): Promise<PaginatedResponse<AdminPlanListItem>>;
}

export function createHttpPlanService(): PlanService {
  return {
    listPlans: (params) => apiRequest(endpoints.plans.list, { auth: 'account', query: { ...params } }),
    getPlan: (planId) => apiRequest(endpoints.plans.detail(planId), { auth: 'account' }),
    createPlan: (request) => apiRequest(endpoints.plans.list, { method: 'POST', auth: 'account', body: request }),
    updatePlan: (planId, request) =>
      apiRequest(endpoints.plans.detail(planId), { method: 'PATCH', auth: 'account', body: request }),
    listAllPlans: (params) => apiRequest(endpoints.admin.plans, { auth: 'admin', query: { ...params } }),
  };
}
