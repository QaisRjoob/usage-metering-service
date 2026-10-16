import type {
  DailyUsagePoint,
  MonthlyUsagePoint,
  RejectionBreakdownItem,
  RequestCounts,
  RuleCode,
  RuleLevel,
  SortOrder,
  UsageOutcome,
  UsageSortField,
  UsageRecord as UsageRecordDto,
} from '../../../../contracts';
import type { QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';
import type { UsageRecord } from '../../../../Domain/Usage/UsageRecord';
import type { PageWindow } from '../../../Common/Pagination/pagination';

export interface UsageFilter {
  accountId?: string;
  externalUserId?: string;
  userId?: string;
  outcome?: UsageOutcome;
  period?: QuotaPeriod;
  /** Inclusive UTC dates, YYYY-MM-DD. */
  from?: string;
  to?: string;
  rule?: RuleCode;
  level?: RuleLevel;
  minUnits?: number;
  maxUnits?: number;
  /** Substring of the request id (case-insensitive). */
  requestId?: string;
  replayed?: boolean;
}

export interface UsageSort {
  field: UsageSortField;
  order: SortOrder;
}

export interface UsageRepository {
  /** Transaction-scoped advisory lock on (account, requestId): concurrent duplicates wait here. */
  lockRequestId(accountId: string, requestId: string): Promise<void>;
  findByRequestId(accountId: string, requestId: string): Promise<UsageRecord | null>;
  /** Records that a stored decision was replayed; returns the new replay count. */
  markReplayed(recordId: string, at: Date): Promise<number>;
  insert(record: Omit<UsageRecord, 'replayCount' | 'externalUserId'>): Promise<void>;

  // Read side (history and analytics). All filters are applied in SQL.
  findView(recordId: string, accountId: string | null): Promise<UsageRecordDto | null>;
  /** Default order: newest first (created_at DESC, id DESC). */
  list(filter: UsageFilter, window: PageWindow, sort?: UsageSort): Promise<{ rows: UsageRecordDto[]; total: number }>;
  requestCounts(filter: UsageFilter): Promise<RequestCounts>;
  /** Days that have records only; the caller fills in empty days. */
  daily(filter: UsageFilter & { period: QuotaPeriod }): Promise<DailyUsagePoint[]>;
  rejectionsByRule(filter: UsageFilter): Promise<RejectionBreakdownItem[]>;
  /** Totals per month; `scope` narrows them to one account or one user. */
  monthly(periods: QuotaPeriod[], scope?: { accountId?: string; userId?: string }): Promise<MonthlyUsagePoint[]>;
}
