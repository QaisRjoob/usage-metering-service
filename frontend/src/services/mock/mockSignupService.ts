/** MOCK ADAPTER - implements SignupService with the same rules as the API. */
import {
  ERROR_CODES,
  PREDEFINED_PLAN_IDS,
  SIGNUP_STATUSES,
  adminListSignupRequestsQuerySchema,
  approveSignupSchema,
  buildPage,
  rejectSignupSchema,
  signupCredentialsSchema,
  submitSignupRequestSchema,
  type AdminSignupRequest,
  type SignupStatus,
} from '@/contracts';
import type { SignupService } from '@/services/signupService';
import type { MockDatabase, SignupRow } from './mockDatabase';
import { conflict, notFound, pageOf, requireAdmin, simulate, unprocessable, validate } from './mockRuntime';

const randomToken = (bytes: number) => {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...values)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const notFoundError = () => notFound(ERROR_CODES.SIGNUP_REQUEST_NOT_FOUND, 'No request matches this request id and claim code.');

function predefinedAccountPlan(db: MockDatabase, planId: string) {
  const plan = db.plans.get(planId);
  if (!plan || !plan.isPredefined) throw notFound(ERROR_CODES.PLAN_NOT_FOUND, 'Plan not found.');
  if (plan.scope !== 'account') throw unprocessable(ERROR_CODES.PLAN_SCOPE_MISMATCH, 'A user plan cannot be assigned to an account.');
  return plan;
}

function verified(db: MockDatabase, requestId: string, claimCode: string): SignupRow {
  const row = db.signupRequests.get(requestId);
  if (!row || row.claimCode !== claimCode) throw notFoundError();
  return row;
}

function toAdmin(db: MockDatabase, row: SignupRow): AdminSignupRequest {
  const account = row.accountId ? db.accounts.get(row.accountId) : undefined;
  return {
    id: row.id,
    companyName: row.companyName,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    useCase: row.useCase,
    requestedPlan: { id: row.requestedPlanId, name: db.plans.get(row.requestedPlanId)?.name ?? 'Plan' },
    status: row.status,
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    account: account ? { id: account.id, name: account.name } : null,
    claimed: row.claimedAt !== null,
  };
}

function pending(db: MockDatabase, requestId: string): SignupRow {
  const row = db.signupRequests.get(requestId);
  if (!row) throw notFoundError();
  if (row.status !== 'pending') throw conflict(ERROR_CODES.SIGNUP_ALREADY_DECIDED, `This request was already ${row.status}.`);
  return row;
}

export function createMockSignupService(): SignupService {
  return {
    submit: (request) =>
      simulate((db) => {
        const input = validate(submitSignupRequestSchema, request);
        const plan = predefinedAccountPlan(db, input.planId ?? PREDEFINED_PLAN_IDS.starter);
        if ([...db.signupRequests.values()].some((row) => row.status === 'pending' && row.contactEmail === input.contactEmail)) {
          throw conflict(ERROR_CODES.SIGNUP_ALREADY_PENDING, 'A request with this email is already waiting for a decision. Check its status with your request id and claim code.');
        }
        const row: SignupRow = {
          id: crypto.randomUUID(),
          companyName: input.companyName,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          useCase: input.useCase || null,
          requestedPlanId: plan.id,
          claimCode: `umc_${randomToken(24)}`,
          status: 'pending',
          decisionNote: null,
          accountId: null,
          submittedAt: db.now().toISOString(),
          decidedAt: null,
          claimedAt: null,
        };
        db.signupRequests.set(row.id, row);
        return { requestId: row.id, claimCode: row.claimCode, status: row.status, submittedAt: row.submittedAt };
      }),

    status: (credentials) =>
      simulate((db) => {
        const input = validate(signupCredentialsSchema, credentials);
        const row = verified(db, input.requestId, input.claimCode);
        return {
          requestId: row.id,
          companyName: row.companyName,
          contactName: row.contactName,
          requestedPlanName: db.plans.get(row.requestedPlanId)?.name ?? 'Plan',
          status: row.status,
          submittedAt: row.submittedAt,
          decidedAt: row.decidedAt,
          decisionNote: row.decisionNote,
          claimed: row.claimedAt !== null,
        };
      }),

    claim: (credentials) =>
      simulate((db) => {
        const input = validate(signupCredentialsSchema, credentials);
        const row = verified(db, input.requestId, input.claimCode);
        if (row.status !== 'approved' || !row.accountId) {
          throw conflict(ERROR_CODES.SIGNUP_NOT_APPROVED, row.status === 'pending' ? 'This request is still waiting for the operator.' : 'This request was denied; there is no API key to collect.');
        }
        if (row.claimedAt) throw conflict(ERROR_CODES.SIGNUP_ALREADY_CLAIMED, 'The API key for this request was already collected. It is shown only once; ask the operator if it was lost.');
        const account = db.accounts.get(row.accountId)!;
        // Like the API: the key made at approval was never shown, so a new one is issued here.
        account.apiKey = `umk_live_${randomToken(32)}`;
        account.apiKeyPrefix = account.apiKey.slice(0, 13);
        row.claimedAt = db.now().toISOString();
        return { account: { id: account.id, name: account.name, apiKeyPrefix: account.apiKeyPrefix, createdAt: account.createdAt }, apiKey: account.apiKey };
      }),

    list: (params) =>
      simulate((db) => {
        requireAdmin();
        const query = validate(adminListSignupRequestsQuerySchema, params);
        const search = query.search?.toLowerCase();
        const matching = [...db.signupRequests.values()].filter(
          (row) => !search || [row.companyName, row.contactName, row.contactEmail].some((value) => value.toLowerCase().includes(search)),
        );
        const counts = Object.fromEntries(SIGNUP_STATUSES.map((status) => [status, matching.filter((row) => row.status === status).length])) as Record<SignupStatus, number>;
        const direction = query.order === 'asc' ? 1 : -1;
        const rows = matching
          .filter((row) => !query.status || row.status === query.status)
          .sort((a, b) => {
            if (query.sort === 'decidedAt') {
              if (a.decidedAt === b.decidedAt) return a.id.localeCompare(b.id) * direction;
              if (a.decidedAt === null) return 1;
              if (b.decidedAt === null) return -1;
              return a.decidedAt.localeCompare(b.decidedAt) * direction;
            }
            const primary = query.sort === 'companyName' ? a.companyName.localeCompare(b.companyName) : a.submittedAt.localeCompare(b.submittedAt);
            return (primary || a.id.localeCompare(b.id)) * direction;
          })
          .map((row) => toAdmin(db, row));
        const page = pageOf(rows, query);
        return { ...buildPage(page.items, page.page, page.pageSize, page.totalItems), counts: { ...counts, total: matching.length } };
      }),

    approve: (requestId, request) =>
      simulate((db) => {
        requireAdmin();
        const input = validate(approveSignupSchema, request);
        const row = pending(db, requestId);
        const plan = predefinedAccountPlan(db, input.planId ?? row.requestedPlanId);
        const { row: account } = db.createAccount({ name: row.companyName, planId: plan.id });
        Object.assign(row, { status: 'approved', accountId: account.id, decisionNote: input.note || null, decidedAt: db.now().toISOString() });
        return toAdmin(db, row);
      }),

    reject: (requestId, note) =>
      simulate((db) => {
        requireAdmin();
        const input = validate(rejectSignupSchema, { note });
        const row = pending(db, requestId);
        Object.assign(row, { status: 'rejected', decisionNote: input.note, decidedAt: db.now().toISOString() });
        return toAdmin(db, row);
      }),
  };
}
