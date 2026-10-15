import { AppError } from '../../Shared/Errors/AppError';

/**
 * A user of a calling application (the brief's "User"), registered under exactly one account.
 * Callers identify users by their own `externalUserId`, unique within the account.
 */
export interface UsageSubject {
  id: string;
  accountId: string;
  externalUserId: string;
  displayName: string | null;
  planId: string;
  createdAt: Date;
}

/** Same answer whether the user does not exist or belongs to another account (no existence leak). */
export const userNotFound = (externalUserId: string) => new AppError('USER_NOT_FOUND', `User "${externalUserId}" was not found in this account.`);

export const userAlreadyExists = (externalUserId: string) =>
  new AppError('USER_ALREADY_EXISTS', `User "${externalUserId}" already exists in this account.`);
