import { z } from 'zod';
import type { AccountSummary } from './accounts';
import { idSchema, searchSchema } from './common';
import { SORT_ORDERS, paginationQuerySchema, type PaginatedResponse } from './pagination';

/**
 * Self-service sign-up. A company submits a request (public), gets a request id and a private
 * claim code, and follows the request with both. The operator approves or denies it; after an
 * approval the company claims its API key once with the same pair. No email is involved.
 */
export const SIGNUP_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

const nameSchema = (label: string) => z.string().trim().min(2, `${label} must be at least 2 characters`).max(100);

/** POST /signup-requests */
export const submitSignupRequestSchema = z.object({
  companyName: nameSchema('Company name'),
  contactName: nameSchema('Your name'),
  contactEmail: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
  /** A predefined account plan (Starter when omitted); the operator may change it on approval. */
  planId: idSchema.optional(),
  useCase: z.string().trim().max(1000).optional(),
});
export type SubmitSignupRequest = z.infer<typeof submitSignupRequestSchema>;

export interface SubmitSignupResponse {
  requestId: string;
  /** Shown once; only its hash is stored. Needed to follow the request and claim the key. */
  claimCode: string;
  status: SignupStatus;
  submittedAt: string;
}

/** Body of POST /signup-requests/status and /signup-requests/claim (secrets never go in the URL). */
export const signupCredentialsSchema = z.object({
  requestId: idSchema,
  claimCode: z.string().trim().min(10, 'Enter the claim code you received').max(200),
});
export type SignupCredentials = z.infer<typeof signupCredentialsSchema>;

/** What the applicant sees about their own request. */
export interface SignupRequestStatus {
  requestId: string;
  companyName: string;
  contactName: string;
  requestedPlanName: string;
  status: SignupStatus;
  submittedAt: string;
  decidedAt: string | null;
  /** The operator's note (reason for a denial, or a welcome message). */
  decisionNote: string | null;
  /** True once the API key has been collected. */
  claimed: boolean;
}

/** POST /signup-requests/claim - the API key is shown once, like POST /admin/accounts. */
export interface ClaimSignupResponse {
  account: AccountSummary;
  apiKey: string;
}

/** Operator view of a request. */
export interface AdminSignupRequest {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  useCase: string | null;
  requestedPlan: { id: string; name: string };
  status: SignupStatus;
  submittedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  /** The account created on approval. */
  account: { id: string; name: string } | null;
  claimed: boolean;
}

export const SIGNUP_SORT_FIELDS = ['submittedAt', 'companyName', 'decidedAt'] as const;
export type SignupSortField = (typeof SIGNUP_SORT_FIELDS)[number];

/** GET /admin/signup-requests */
export const adminListSignupRequestsQuerySchema = paginationQuerySchema.extend({
  /** Company, contact name or email. */
  search: searchSchema(100),
  status: z.enum(SIGNUP_STATUSES).optional(),
  sort: z.enum(SIGNUP_SORT_FIELDS).default('submittedAt'),
  order: z.enum(SORT_ORDERS).default('desc'),
});
export type AdminListSignupRequestsParams = Partial<z.infer<typeof adminListSignupRequestsQuerySchema>>;

export interface AdminSignupRequestPage extends PaginatedResponse<AdminSignupRequest> {
  /** Requests per status within `search` (for the tabs and the pending badge). */
  counts: Record<SignupStatus, number> & { total: number };
}

/** POST /admin/signup-requests/:requestId/approve */
export const approveSignupSchema = z.object({
  /** Predefined account plan for the new account; defaults to the requested one. */
  planId: idSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type ApproveSignupRequest = z.infer<typeof approveSignupSchema>;

/** POST /admin/signup-requests/:requestId/reject */
export const rejectSignupSchema = z.object({
  note: z.string().trim().min(3, 'Give the company a short reason').max(500),
});
export type RejectSignupRequest = z.infer<typeof rejectSignupSchema>;
