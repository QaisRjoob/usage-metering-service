import type { z } from 'zod';
import {
  PREDEFINED_PLAN_IDS,
  buildPage,
  type AdminSignupRequest,
  type AdminSignupRequestPage,
  type ApproveSignupRequest,
  type ClaimSignupResponse,
  type SignupCredentials,
  type SignupRequestStatus,
  type SubmitSignupRequest,
  type SubmitSignupResponse,
  type adminListSignupRequestsQuerySchema,
} from '../../../contracts';
import { generateApiKey } from '../../../Domain/Accounts/ApiKey';
import { assertAssignableTo, type Plan } from '../../../Domain/Plans/Plan';
import { planNotFound } from '../../../Domain/Plans/PlanErrors';
import {
  claimCodeMatches,
  generateClaimCode,
  signupAlreadyClaimed,
  signupAlreadyDecided,
  signupNotApproved,
  signupRequestNotFound,
  type SignupRequest,
} from '../../../Domain/Signup/SignupRequest';
import type { Clock } from '../../Common/Clock';
import { pageWindow } from '../../Common/Pagination/pagination';
import type { TransactionManager } from '../../Common/TransactionManager';
import { toAccountSummary } from '../Accounts/DTOs/accountMapping';
import type { PlanRepository } from '../Plans/Interfaces/PlanRepository';
import type { SignupRequestRepository } from './Interfaces/SignupRequestRepository';

/** New accounts start on a predefined account plan (custom plans belong to existing accounts). */
function assertPredefinedAccountPlan(plan: Plan | null): Plan {
  if (!plan || !plan.isPredefined) throw planNotFound();
  assertAssignableTo(plan, 'account');
  return plan;
}

/** Loads a request for the applicant; an unknown id and a wrong code look the same. */
function verified(request: SignupRequest | null, claimCode: string): SignupRequest {
  if (!request || !claimCodeMatches(claimCode, request.claimCodeHash)) throw signupRequestNotFound();
  return request;
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

export function toAdminSignupRequest(request: SignupRequest): AdminSignupRequest {
  return {
    id: request.id,
    companyName: request.companyName,
    contactName: request.contactName,
    contactEmail: request.contactEmail,
    useCase: request.useCase,
    requestedPlan: { id: request.requestedPlanId, name: request.requestedPlanName },
    status: request.status,
    submittedAt: request.submittedAt.toISOString(),
    decidedAt: iso(request.decidedAt),
    decisionNote: request.decisionNote,
    account: request.accountId ? { id: request.accountId, name: request.accountName ?? request.companyName } : null,
    claimed: request.claimedAt !== null,
  };
}

/** POST /signup-requests (public). */
export class SubmitSignupRequestCommand {
  constructor(
    private readonly requests: SignupRequestRepository,
    private readonly plans: PlanRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: SubmitSignupRequest): Promise<SubmitSignupResponse> {
    const plan = assertPredefinedAccountPlan(await this.plans.findById(input.planId ?? PREDEFINED_PLAN_IDS.starter));
    const code = generateClaimCode();
    const request = await this.requests.create({
      companyName: input.companyName,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      useCase: input.useCase || null,
      requestedPlanId: plan.id,
      claimCodeHash: code.hash,
      submittedAt: this.clock.now(),
    });
    return { requestId: request.id, claimCode: code.raw, status: request.status, submittedAt: request.submittedAt.toISOString() };
  }
}

/** POST /signup-requests/status (public, with the claim code). */
export class GetSignupStatusQuery {
  constructor(private readonly requests: SignupRequestRepository) {}

  async execute(credentials: SignupCredentials): Promise<SignupRequestStatus> {
    const request = verified(await this.requests.findById(credentials.requestId), credentials.claimCode);
    return {
      requestId: request.id,
      companyName: request.companyName,
      contactName: request.contactName,
      requestedPlanName: request.requestedPlanName,
      status: request.status,
      submittedAt: request.submittedAt.toISOString(),
      decidedAt: iso(request.decidedAt),
      decisionNote: request.decisionNote,
      claimed: request.claimedAt !== null,
    };
  }
}

/**
 * POST /signup-requests/claim (public). Issues the account's real API key, once: the key created
 * on approval was never shown to anyone, so it is replaced here and only the new hash is stored.
 */
export class ClaimSignupCommand {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
    /** Called after commit with the hash of the replaced key (drops it from the lookup cache). */
    private readonly onKeyReplaced: (previousHash: string) => void = () => {},
  ) {}

  async execute(credentials: SignupCredentials): Promise<ClaimSignupResponse> {
    let previousHash: string | null = null;
    const result = await this.transactions.run(async (repos) => {
      const request = verified(await repos.signupRequests.findByIdForUpdate(credentials.requestId), credentials.claimCode);
      if (request.status !== 'approved' || !request.accountId) throw signupNotApproved(request.status);
      if (request.claimedAt) throw signupAlreadyClaimed();
      const key = generateApiKey();
      const now = this.clock.now();
      previousHash = await repos.accounts.updateApiKey(request.accountId, key.hash, key.prefix, now);
      await repos.signupRequests.markClaimed(request.id, now);
      const account = await repos.accounts.findById(request.accountId);
      return { account: toAccountSummary(account!), apiKey: key.raw };
    });
    if (previousHash) this.onKeyReplaced(previousHash);
    return result;
  }
}

/** GET /admin/signup-requests */
export class ListSignupRequestsQuery {
  constructor(private readonly requests: SignupRequestRepository) {}

  async execute(input: z.output<typeof adminListSignupRequestsQuerySchema>): Promise<AdminSignupRequestPage> {
    const [page, counts] = await Promise.all([
      this.requests.list({ search: input.search, status: input.status, sort: input.sort, order: input.order }, pageWindow(input.page, input.pageSize)),
      this.requests.counts(input.search),
    ]);
    return {
      ...buildPage(page.rows.map(toAdminSignupRequest), input.page, input.pageSize, page.total),
      counts: { ...counts, total: counts.pending + counts.approved + counts.rejected },
    };
  }
}

/** POST /admin/signup-requests/:id/approve - creates the account in the same transaction. */
export class ApproveSignupCommand {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  async execute(requestId: string, input: ApproveSignupRequest): Promise<AdminSignupRequest> {
    return this.transactions.run(async (repos) => {
      const request = await repos.signupRequests.findByIdForUpdate(requestId);
      if (!request) throw signupRequestNotFound();
      if (request.status !== 'pending') throw signupAlreadyDecided(request.status);
      const plan = assertPredefinedAccountPlan(await repos.plans.findById(input.planId ?? request.requestedPlanId));
      const now = this.clock.now();
      // Placeholder key: never shown; replaced by the real key when the company claims it.
      const placeholder = generateApiKey();
      const account = await repos.accounts.create({ name: request.companyName, apiKeyHash: placeholder.hash, apiKeyPrefix: placeholder.prefix, planId: plan.id, createdAt: now });
      await repos.signupRequests.markApproved(request.id, account.id, input.note || null, now);
      return toAdminSignupRequest((await repos.signupRequests.findById(request.id))!);
    });
  }
}

/** POST /admin/signup-requests/:id/reject */
export class RejectSignupCommand {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  async execute(requestId: string, note: string): Promise<AdminSignupRequest> {
    return this.transactions.run(async (repos) => {
      const request = await repos.signupRequests.findByIdForUpdate(requestId);
      if (!request) throw signupRequestNotFound();
      if (request.status !== 'pending') throw signupAlreadyDecided(request.status);
      await repos.signupRequests.markRejected(request.id, note, this.clock.now());
      return toAdminSignupRequest((await repos.signupRequests.findById(request.id))!);
    });
  }
}
