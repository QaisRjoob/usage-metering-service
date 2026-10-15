import type { PlanScope } from '../../contracts';
import { AppError } from '../../Shared/Errors/AppError';

export const planNotFound = () => new AppError('PLAN_NOT_FOUND', 'Plan not found.');

export const planReadOnly = () => new AppError('PLAN_READ_ONLY', 'Predefined plans are read-only. Create a custom plan instead.');

export const planScopeMismatch = (expected: PlanScope) =>
  new AppError(
    'PLAN_SCOPE_MISMATCH',
    expected === 'account' ? 'A user plan cannot be assigned to an account.' : 'An account plan cannot be assigned to a user.',
  );

export const planNameTaken = (name: string) => new AppError('PLAN_NAME_TAKEN', `A custom plan named "${name}" already exists in this account.`);
