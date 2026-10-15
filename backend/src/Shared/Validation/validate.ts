import type { ZodType } from 'zod';
import { AppError } from '../Errors/AppError';

/** Parses external input with a shared contract schema; failures become 400 VALIDATION_ERROR. */
export function validate<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new AppError(
    'VALIDATION_ERROR',
    'Request validation failed.',
    result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );
}
