import type { ErrorCode, ValidationIssue } from '../../contracts';

/**
 * Error carrying a stable, documented error code. Every layer throws it; only the HTTP layer
 * translates the code into a status (see Shared/Errors/httpStatus.ts).
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ValidationIssue[] | Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
