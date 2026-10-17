import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SignupStatus } from '../../contracts';
import { AppError } from '../../Shared/Errors/AppError';

/** A self-service sign-up request as stored. */
export interface SignupRequest {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  useCase: string | null;
  requestedPlanId: string;
  requestedPlanName: string;
  claimCodeHash: string;
  status: SignupStatus;
  decisionNote: string | null;
  accountId: string | null;
  accountName: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
  claimedAt: Date | null;
}

/**
 * Claim codes: "umc_" + 24 random bytes (base64url). Like API keys they are long and random, so a
 * SHA-256 hash is enough; only the hash is stored and the code is shown to the applicant once.
 */
export function generateClaimCode(random: (size: number) => Buffer = randomBytes): { raw: string; hash: string } {
  const raw = `umc_${random(24).toString('base64url')}`;
  return { raw, hash: hashClaimCode(raw) };
}

export function hashClaimCode(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** Constant-time comparison of a presented code with the stored hash. */
export function claimCodeMatches(raw: string, storedHash: string): boolean {
  const presented = Buffer.from(hashClaimCode(raw), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

// A wrong claim code answers exactly like an unknown request, so ids cannot be probed.
export const signupRequestNotFound = () => new AppError('SIGNUP_REQUEST_NOT_FOUND', 'No request matches this request id and claim code.');
export const signupAlreadyPending = () =>
  new AppError('SIGNUP_ALREADY_PENDING', 'A request with this email is already waiting for a decision. Check its status with your request id and claim code.');
export const signupAlreadyDecided = (status: SignupStatus) => new AppError('SIGNUP_ALREADY_DECIDED', `This request was already ${status}.`);
export const signupNotApproved = (status: SignupStatus) =>
  new AppError('SIGNUP_NOT_APPROVED', status === 'pending' ? 'This request is still waiting for the operator.' : 'This request was denied; there is no API key to collect.');
export const signupAlreadyClaimed = () =>
  new AppError('SIGNUP_ALREADY_CLAIMED', 'The API key for this request was already collected. It is shown only once; ask the operator if it was lost.');
