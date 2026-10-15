import { z } from 'zod';
import { MAX_MONTHLY_ALLOWANCE, MAX_UNITS_PER_REQUEST_INPUT, idSchema } from './common';
import { paginationQuerySchema } from './pagination';

export const PLAN_SCOPES = ['account', 'user'] as const;
export type PlanScope = (typeof PLAN_SCOPES)[number];

export const PLAN_KINDS = ['predefined', 'custom'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

/** Immutable revision of a plan's limits. Every limit change creates a new version. */
export interface PlanVersion {
  id: string;
  planId: string;
  version: number;
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  scope: PlanScope;
  /** Predefined plans are seeded at startup, have no owner and are read-only. */
  isPredefined: boolean;
  /** Owning account for custom plans; null for predefined plans. */
  ownerAccountId: string | null;
  currentVersion: PlanVersion;
  createdAt: string;
  updatedAt: string;
}

export interface PlanDetails extends Plan {
  /** All versions, newest first. */
  versions: PlanVersion[];
  /** How many of the caller's accounts/users currently use this plan (only the caller's own). */
  assignedAccounts: number;
  assignedUsers: number;
}

const planNameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(80);
const descriptionSchema = z.string().trim().max(500);
const monthlyAllowanceSchema = z
  .number()
  .int('Monthly allowance must be a whole number')
  .min(0, 'Monthly allowance cannot be negative')
  .max(MAX_MONTHLY_ALLOWANCE);
const maxUnitsPerRequestSchema = z
  .number()
  .int('Max units per request must be a whole number')
  .min(1, 'Max units per request must be at least 1')
  .max(MAX_UNITS_PER_REQUEST_INPUT);

export const createPlanSchema = z.object({
  name: planNameSchema,
  description: descriptionSchema.optional(),
  scope: z.enum(PLAN_SCOPES),
  monthlyAllowance: monthlyAllowanceSchema,
  maxUnitsPerRequest: maxUnitsPerRequestSchema,
});
export type CreatePlanRequest = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = z
  .object({
    name: planNameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    monthlyAllowance: monthlyAllowanceSchema.optional(),
    maxUnitsPerRequest: maxUnitsPerRequestSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });
export type UpdatePlanRequest = z.infer<typeof updatePlanSchema>;

export const assignPlanSchema = z.object({ planId: idSchema });
export type AssignPlanRequest = z.infer<typeof assignPlanSchema>;

export const listPlansQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(PLAN_SCOPES).optional(),
  kind: z.enum(PLAN_KINDS).optional(),
});
export type ListPlansParams = Partial<z.infer<typeof listPlansQuerySchema>>;
