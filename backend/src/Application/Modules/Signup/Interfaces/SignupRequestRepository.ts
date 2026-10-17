import type { SignupSortField, SignupStatus, SortOrder } from '../../../../contracts';
import type { SignupRequest } from '../../../../Domain/Signup/SignupRequest';
import type { PageWindow } from '../../../Common/Pagination/pagination';

export interface SignupListFilter {
  search?: string;
  status?: SignupStatus;
  sort: SignupSortField;
  order: SortOrder;
}

export interface SignupRequestRepository {
  /** Throws SIGNUP_ALREADY_PENDING when this email already has an open request. */
  create(input: {
    companyName: string;
    contactName: string;
    contactEmail: string;
    useCase: string | null;
    requestedPlanId: string;
    claimCodeHash: string;
    submittedAt: Date;
  }): Promise<SignupRequest>;
  findById(requestId: string): Promise<SignupRequest | null>;
  /** Row-locks the request for the rest of the transaction (approve, reject, claim). */
  findByIdForUpdate(requestId: string): Promise<SignupRequest | null>;
  markApproved(requestId: string, accountId: string, note: string | null, at: Date): Promise<void>;
  markRejected(requestId: string, note: string, at: Date): Promise<void>;
  markClaimed(requestId: string, at: Date): Promise<void>;
  list(filter: SignupListFilter, window: PageWindow): Promise<{ rows: SignupRequest[]; total: number }>;
  /** Requests per status within `search`. */
  counts(search?: string): Promise<Record<SignupStatus, number>>;
}
