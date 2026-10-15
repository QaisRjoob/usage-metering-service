import type { UsageRecord } from '../../../../contracts';
import { usageRecordNotFound } from '../../../../Domain/Usage/UsageErrors';
import type { UsageRepository } from '../Interfaces/UsageRepository';

/** GET /usage/:usageId - only records of the calling account; others are "not found". */
export class GetUsageRecordQuery {
  constructor(private readonly usage: UsageRepository) {}

  async execute(accountId: string, usageId: string): Promise<UsageRecord> {
    const record = await this.usage.findView(usageId, accountId);
    if (!record) throw usageRecordNotFound();
    return record;
  }
}
