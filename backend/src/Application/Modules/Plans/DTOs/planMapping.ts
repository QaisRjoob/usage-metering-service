import type { Plan as PlanDto, PlanDetails, PlanVersion as PlanVersionDto } from '../../../../contracts';
import type { Plan } from '../../../../Domain/Plans/Plan';
import type { PlanVersion } from '../../../../Domain/Plans/PlanVersion';
import type { PlanVersionRow } from '../../Quotas/DTOs/quotaMapping';

export function toPlanVersionDto(version: PlanVersion): PlanVersionDto {
  return {
    id: version.id,
    planId: version.planId,
    version: version.version,
    monthlyAllowance: version.monthlyAllowance,
    maxUnitsPerRequest: version.maxUnitsPerRequest,
    createdAt: version.createdAt.toISOString(),
  };
}

export function toPlanDto(plan: Plan): PlanDto {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    scope: plan.scope,
    isPredefined: plan.isPredefined,
    ownerAccountId: plan.ownerAccountId,
    currentVersion: toPlanVersionDto(plan.currentVersion),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function toPlanDetails(plan: Plan, versions: PlanVersion[], assignments: { accounts: number; users: number }): PlanDetails {
  return { ...toPlanDto(plan), versions: versions.map(toPlanVersionDto), assignedAccounts: assignments.accounts, assignedUsers: assignments.users };
}

export function toPlanVersionRow(plan: Plan): PlanVersionRow {
  return {
    planId: plan.id,
    planName: plan.name,
    planVersionId: plan.currentVersion.id,
    planVersion: plan.currentVersion.version,
    monthlyAllowance: plan.currentVersion.monthlyAllowance,
    maxUnitsPerRequest: plan.currentVersion.maxUnitsPerRequest,
  };
}
