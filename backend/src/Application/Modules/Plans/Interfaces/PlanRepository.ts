import type { PlanKind, PlanScope } from '../../../../contracts';
import type { Plan } from '../../../../Domain/Plans/Plan';
import type { PlanVersion } from '../../../../Domain/Plans/PlanVersion';
import type { QuotaLimits } from '../../../../Domain/Quotas/QuotaPolicy';
import type { PageWindow } from '../../../Common/Pagination/pagination';
import type { PlanVersionRow } from '../../Quotas/DTOs/quotaMapping';

export interface PlanRepository {
  findById(planId: string): Promise<Plan | null>;
  /** SELECT ... FOR UPDATE: serializes concurrent updates of the same plan. */
  findByIdForUpdate(planId: string): Promise<Plan | null>;
  /** Predefined plans plus the account's own custom plans. */
  listVisible(accountId: string, filter: { scope?: PlanScope; kind?: PlanKind }, window: PageWindow): Promise<{ rows: Plan[]; total: number }>;
  listVersions(planId: string): Promise<PlanVersion[]>;
  countAssignments(planId: string, accountId: string): Promise<{ accounts: number; users: number }>;
  /** Throws PLAN_NAME_TAKEN for a duplicate custom plan name in the same account. */
  create(input: { name: string; description: string | null; scope: PlanScope; ownerAccountId: string; limits: QuotaLimits; createdAt: Date }): Promise<Plan>;
  /** Updates name/description; when `limits` is given, inserts a new version and points the plan at it. */
  update(planId: string, input: { name?: string; description?: string | null; limits: QuotaLimits | null; updatedAt: Date }): Promise<void>;
  /**
   * The plan versions currently assigned to the account and to the user, in one query. Called
   * inside the consume transaction after the counter locks, so a committed plan change is seen.
   */
  currentVersions(accountId: string, userId: string): Promise<{ account: PlanVersionRow; user: PlanVersionRow }>;
  versionRowsByIds(versionIds: string[]): Promise<Map<string, PlanVersionRow>>;
}
