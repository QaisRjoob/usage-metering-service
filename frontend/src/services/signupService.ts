import type {
  AdminListSignupRequestsParams,
  AdminSignupRequest,
  AdminSignupRequestPage,
  ApproveSignupRequest,
  ClaimSignupResponse,
  SignupCredentials,
  SignupRequestStatus,
  SubmitSignupRequest,
  SubmitSignupResponse,
} from '@/contracts';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

/**
 * Self-service sign-up. The first three calls are public (no credential; the claim code travels in
 * the JSON body, never in the URL); the last three are the operator's review.
 */
export interface SignupService {
  submit(request: SubmitSignupRequest): Promise<SubmitSignupResponse>;
  status(credentials: SignupCredentials): Promise<SignupRequestStatus>;
  claim(credentials: SignupCredentials): Promise<ClaimSignupResponse>;
  list(params: AdminListSignupRequestsParams): Promise<AdminSignupRequestPage>;
  approve(requestId: string, request: ApproveSignupRequest): Promise<AdminSignupRequest>;
  reject(requestId: string, note: string): Promise<AdminSignupRequest>;
}

export function createHttpSignupService(): SignupService {
  return {
    submit: (request) => apiRequest(endpoints.signup.submit, { method: 'POST', auth: 'none', body: request }),
    status: (credentials) => apiRequest(endpoints.signup.status, { method: 'POST', auth: 'none', body: credentials }),
    claim: (credentials) => apiRequest(endpoints.signup.claim, { method: 'POST', auth: 'none', body: credentials }),
    list: (params) => apiRequest(endpoints.admin.signupRequests, { auth: 'admin', query: { ...params } }),
    approve: (requestId, request) => apiRequest(endpoints.admin.approveSignup(requestId), { method: 'POST', auth: 'admin', body: request }),
    reject: (requestId, note) => apiRequest(endpoints.admin.rejectSignup(requestId), { method: 'POST', auth: 'admin', body: { note } }),
  };
}
