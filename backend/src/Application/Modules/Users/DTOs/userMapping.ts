import type { UserSummary, UserWithQuota } from '../../../../contracts';
import type { QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';
import { toQuotaSnapshot } from '../../Quotas/DTOs/quotaMapping';
import type { UserQuotaRow } from '../Interfaces/UserRepository';

export function toUserSummary(user: { id: string; externalUserId: string; displayName: string | null; createdAt: Date }): UserSummary {
  return { id: user.id, externalUserId: user.externalUserId, displayName: user.displayName, createdAt: user.createdAt.toISOString() };
}

export function toUserWithQuota(row: UserQuotaRow, period: QuotaPeriod): UserWithQuota {
  return { ...toUserSummary(row), quota: toQuotaSnapshot('user', period, row.plan, row.consumed) };
}
