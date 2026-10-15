import type { AccountDetails } from '../../../../contracts';
import { accountNotFound } from '../../../../Domain/Accounts/AccountErrors';
import { periodOf, type QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';
import type { Clock } from '../../../Common/Clock';
import type { UsageRepository } from '../../Usage/Interfaces/UsageRepository';
import type { AccountRepository } from '../Interfaces/AccountRepository';
import { toAccountListItem } from '../DTOs/accountMapping';

/** Operator: one account with its quota and request counts for a month. */
export class GetAccountDetailsQuery {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly usage: UsageRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, month?: QuotaPeriod): Promise<AccountDetails> {
    const period = month ?? periodOf(this.clock.now());
    const row = await this.accounts.getQuotaRow(accountId, period);
    if (!row) throw accountNotFound();
    const requests = await this.usage.requestCounts({ accountId, period });
    return { ...toAccountListItem(row, period), requests };
  }
}
