import type { AccountListItem, AccountSummary } from '../../../../contracts';
import type { Account } from '../../../../Domain/Accounts/Account';
import type { QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';
import { toQuotaSnapshot } from '../../Quotas/DTOs/quotaMapping';
import type { AccountQuotaRow } from '../Interfaces/AccountRepository';

export function toAccountSummary(account: Pick<Account, 'id' | 'name' | 'apiKeyPrefix' | 'createdAt'>): AccountSummary {
  return { id: account.id, name: account.name, apiKeyPrefix: account.apiKeyPrefix, createdAt: account.createdAt.toISOString() };
}

export function toAccountListItem(row: AccountQuotaRow, period: QuotaPeriod): AccountListItem {
  return { ...toAccountSummary(row), quota: toQuotaSnapshot('account', period, row.plan, row.consumed), userCount: row.userCount };
}
