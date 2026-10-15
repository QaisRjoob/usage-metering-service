import type { PlanScope } from '../../contracts';
import { planNotFound, planReadOnly, planScopeMismatch } from './PlanErrors';
import type { PlanVersion } from './PlanVersion';

/**
 * A named set of rules, assignable to an account (scope "account") or a user (scope "user").
 * Predefined plans are seeded at startup, have no owner and are read-only. Custom plans belong
 * to exactly one account.
 */
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  scope: PlanScope;
  isPredefined: boolean;
  ownerAccountId: string | null;
  currentVersion: PlanVersion;
  createdAt: Date;
  updatedAt: Date;
}

/** An account may see predefined plans and its own custom plans. Others' plans are "not found". */
export function isVisibleTo(plan: Pick<Plan, 'isPredefined' | 'ownerAccountId'>, accountId: string): boolean {
  return plan.isPredefined || plan.ownerAccountId === accountId;
}

export function assertVisibleTo(plan: Plan | null, accountId: string): Plan {
  if (!plan || !isVisibleTo(plan, accountId)) throw planNotFound();
  return plan;
}

export function assertEditable(plan: Plan): void {
  if (plan.isPredefined) throw planReadOnly();
}

/** Account plans go on accounts, user plans on users. */
export function assertAssignableTo(plan: Plan, target: PlanScope): void {
  if (plan.scope !== target) throw planScopeMismatch(target);
}
