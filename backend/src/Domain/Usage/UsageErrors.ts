import { AppError } from '../../Shared/Errors/AppError';

export const idempotencyKeyReused = (requestId: string) =>
  new AppError(
    'IDEMPOTENCY_KEY_REUSED',
    `requestId "${requestId}" was already used with a different userId or units. Use a new requestId for a different request.`,
  );

export const usageRecordNotFound = () => new AppError('USAGE_RECORD_NOT_FOUND', 'Usage record not found.');
