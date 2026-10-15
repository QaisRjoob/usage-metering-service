import type { ZodType } from 'zod';

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> = { success: true; data: T } | { success: false; errors: FieldErrors };

/** Validates a form draft with a shared contract schema and returns the first message per field. */
export function validateWith<T>(schema: ZodType<T>, value: unknown): ValidationResult<T> {
  const result = schema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    errors[key] ??= issue.message;
  }
  return { success: false, errors };
}

/** Parses a numeric text input; returns NaN for empty or non-numeric input so validation can flag it. */
export function parseNumberInput(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return Number.NaN;
  return Number(trimmed.replace(/,/g, ''));
}

export function optionalText(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === '' ? undefined : trimmed;
}
