import type { SignupStatus } from '../../contracts';
import type { PageWindow } from '../../Application/Common/Pagination/pagination';
import type { SignupListFilter, SignupRequestRepository } from '../../Application/Modules/Signup/Interfaces/SignupRequestRepository';
import { signupAlreadyPending, type SignupRequest } from '../../Domain/Signup/SignupRequest';
import { PG_ERROR, pgErrorCode, type Queryable } from '../Database/postgres';
import { SqlParams, likePattern } from './sqlFragments';

interface SignupColumns {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  use_case: string | null;
  requested_plan_id: string;
  requested_plan_name: string;
  claim_code_hash: string;
  status: SignupStatus;
  decision_note: string | null;
  account_id: string | null;
  account_name: string | null;
  submitted_at: Date;
  decided_at: Date | null;
  claimed_at: Date | null;
}

const toRequest = (row: SignupColumns): SignupRequest => ({
  id: row.id,
  companyName: row.company_name,
  contactName: row.contact_name,
  contactEmail: row.contact_email,
  useCase: row.use_case,
  requestedPlanId: row.requested_plan_id,
  requestedPlanName: row.requested_plan_name,
  claimCodeHash: row.claim_code_hash,
  status: row.status,
  decisionNote: row.decision_note,
  accountId: row.account_id,
  accountName: row.account_name,
  submittedAt: row.submitted_at,
  decidedAt: row.decided_at,
  claimedAt: row.claimed_at,
});

const SELECT = `
  SELECT s.id, s.company_name, s.contact_name, s.contact_email, s.use_case, s.requested_plan_id,
         p.name AS requested_plan_name, s.claim_code_hash, s.status, s.decision_note, s.account_id,
         a.name AS account_name, s.submitted_at, s.decided_at, s.claimed_at
  FROM signup_requests s
  JOIN plans p ON p.id = s.requested_plan_id
  LEFT JOIN accounts a ON a.id = s.account_id`;

/** Whitelisted sort keys. */
const SORT_SQL: Record<SignupListFilter['sort'], string> = {
  submittedAt: 's.submitted_at',
  companyName: 'lower(s.company_name)',
  decidedAt: 's.decided_at',
};

function searchCondition(params: SqlParams, search: string): string {
  const pattern = params.add(likePattern(search));
  return `(s.company_name ILIKE ${pattern} OR s.contact_name ILIKE ${pattern} OR s.contact_email ILIKE ${pattern})`;
}

export class PostgresSignupRequestRepository implements SignupRequestRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: {
    companyName: string;
    contactName: string;
    contactEmail: string;
    useCase: string | null;
    requestedPlanId: string;
    claimCodeHash: string;
    submittedAt: Date;
  }): Promise<SignupRequest> {
    try {
      const { rows } = await this.db.query<{ id: string }>(
        `INSERT INTO signup_requests (company_name, contact_name, contact_email, use_case, requested_plan_id, claim_code_hash, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [input.companyName, input.contactName, input.contactEmail, input.useCase, input.requestedPlanId, input.claimCodeHash, input.submittedAt],
      );
      return (await this.findById(rows[0]!.id))!;
    } catch (error) {
      if (pgErrorCode(error) === PG_ERROR.UNIQUE_VIOLATION) throw signupAlreadyPending();
      throw error;
    }
  }

  async findById(requestId: string): Promise<SignupRequest | null> {
    const { rows } = await this.db.query<SignupColumns>(`${SELECT} WHERE s.id = $1`, [requestId]);
    return rows[0] ? toRequest(rows[0]) : null;
  }

  async findByIdForUpdate(requestId: string): Promise<SignupRequest | null> {
    const { rows } = await this.db.query<SignupColumns>(`${SELECT} WHERE s.id = $1 FOR UPDATE OF s`, [requestId]);
    return rows[0] ? toRequest(rows[0]) : null;
  }

  async markApproved(requestId: string, accountId: string, note: string | null, at: Date): Promise<void> {
    await this.db.query(`UPDATE signup_requests SET status = 'approved', account_id = $2, decision_note = $3, decided_at = $4 WHERE id = $1`, [requestId, accountId, note, at]);
  }

  async markRejected(requestId: string, note: string, at: Date): Promise<void> {
    await this.db.query(`UPDATE signup_requests SET status = 'rejected', decision_note = $2, decided_at = $3 WHERE id = $1`, [requestId, note, at]);
  }

  async markClaimed(requestId: string, at: Date): Promise<void> {
    await this.db.query('UPDATE signup_requests SET claimed_at = $2 WHERE id = $1', [requestId, at]);
  }

  async list(filter: SignupListFilter, window: PageWindow): Promise<{ rows: SignupRequest[]; total: number }> {
    const params = new SqlParams();
    const conditions: string[] = [];
    if (filter.search) conditions.push(searchCondition(params, filter.search));
    if (filter.status) conditions.push(`s.status = ${params.add(filter.status)}`);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const direction = filter.order === 'asc' ? 'ASC' : 'DESC';
    const countResult = await this.db.query<{ total: number }>(`SELECT count(*) AS total FROM signup_requests s ${where}`, params.values);
    const limit = params.add(window.limit);
    const offset = params.add(window.offset);
    const { rows } = await this.db.query<SignupColumns>(
      `${SELECT} ${where} ORDER BY ${SORT_SQL[filter.sort]} ${direction} NULLS LAST, s.id ${direction} LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return { rows: rows.map(toRequest), total: countResult.rows[0]?.total ?? 0 };
  }

  async counts(search?: string): Promise<Record<SignupStatus, number>> {
    const params = new SqlParams();
    const where = search ? `WHERE ${searchCondition(params, search)}` : '';
    const { rows } = await this.db.query<{ status: SignupStatus; count: number }>(`SELECT s.status, count(*) AS count FROM signup_requests s ${where} GROUP BY s.status`, params.values);
    const counts: Record<SignupStatus, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  }
}
