/**
 * MOCK ADAPTER RUNTIME - shared helpers for the mock services: the singleton mock database,
 * simulated latency, credential checks that mirror the API (401/404 semantics) and validation.
 */
import { ERROR_CODES, buildPage, paginationQuerySchema, type ListUsersParams, type PaginatedResponse, type UserListItem } from '@/contracts';
import type { ZodType } from 'zod';
import { ApiError } from '@/services/api/apiErrors';
import { credentials } from '@/services/api/credentials';
import { MockDatabase, type AccountRow } from './mockDatabase';
import { MOCK_ADMIN_TOKEN, seedMockDatabase } from './mockSeed';

let database: MockDatabase | null = null;
let latency = { min: 120, max: 320 };

export function getMockDb(): MockDatabase {
  if (!database) {
    database = new MockDatabase();
    seedMockDatabase(database);
  }
  return database;
}

/** Test hook: replaces the database (optionally with a fixed clock) and reseeds it. */
export function resetMockDb(clock?: () => Date): MockDatabase {
  database = new MockDatabase(clock);
  seedMockDatabase(database);
  return database;
}

/** Test hook: 0 disables the simulated network delay. */
export function setMockLatency(ms: number): void {
  latency = { min: ms, max: ms };
}

function delay(): Promise<void> {
  const ms = latency.min + Math.random() * (latency.max - latency.min);
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs a mock handler after a simulated delay and returns a detached copy of the result. */
export async function simulate<T>(handler: (db: MockDatabase) => T): Promise<T> {
  await delay();
  return structuredClone(handler(getMockDb()));
}

function httpError(status: number, code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES], message: string, details?: ApiError['details']) {
  return new ApiError({ kind: 'http', status, code, message, requestId: 'mock', details });
}

export function requireAdmin(explicitToken?: string): void {
  const token = explicitToken ?? credentials.get().adminToken;
  if (!token) throw httpError(401, ERROR_CODES.ADMIN_TOKEN_MISSING, 'Missing admin token. Send Authorization: Bearer <token>.');
  if (token !== MOCK_ADMIN_TOKEN) throw httpError(401, ERROR_CODES.ADMIN_TOKEN_INVALID, 'Invalid admin token.');
}

export function requireAccount(db: MockDatabase, explicitKey?: string): AccountRow {
  const apiKey = explicitKey ?? credentials.get().account?.apiKey;
  if (!apiKey) throw httpError(401, ERROR_CODES.API_KEY_MISSING, 'Missing API key. Send it in the X-API-Key header.');
  const account = db.findAccountByKey(apiKey);
  if (!account) throw httpError(401, ERROR_CODES.API_KEY_INVALID, 'Invalid API key.');
  return account;
}

export function validate<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw httpError(
    400,
    ERROR_CODES.VALIDATION_ERROR,
    'Request validation failed.',
    result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );
}

export function conflict(code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES], message: string): ApiError {
  return httpError(409, code, message);
}

export function forbidden(code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES], message: string): ApiError {
  return httpError(403, code, message);
}

export function unprocessable(code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES], message: string): ApiError {
  return httpError(422, code, message);
}

export function notFound(code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES], message: string): ApiError {
  return httpError(404, code, message);
}

export function pageOf<T>(items: T[], params: { page?: number; pageSize?: number }): PaginatedResponse<T> {
  const { page, pageSize } = validate(paginationQuerySchema, params);
  return buildPage(items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, items.length);
}

/** Missing values go last in both directions, like SQL "NULLS LAST". */
export function compareNullsLast(a: string | null, b: string | null, direction: 1 | -1): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b) * direction;
}

/** Users of one account with their quota and activity, filtered like the API's users list. */
export function filteredUsers(db: MockDatabase, accountId: string, params: Omit<ListUsersParams, 'month'>, period: string): UserListItem[] {
  const search = params.search?.trim().toLowerCase();
  return db
    .accountUsers(accountId)
    .filter((user) => !search || user.externalUserId.toLowerCase().includes(search) || (user.displayName ?? '').toLowerCase().includes(search))
    .filter((user) => !params.planId || user.planId === params.planId)
    .filter((user) => !params.createdFrom || user.createdAt.slice(0, 10) >= params.createdFrom)
    .filter((user) => !params.createdTo || user.createdAt.slice(0, 10) <= params.createdTo)
    .map((user) => ({ ...db.userWithQuota(user, period), activity: db.activity((row) => row.userId === user.id, period) }))
    .filter((user) => !params.status || user.quota.status === params.status)
    .filter((user) => params.minUtilization === undefined || user.quota.utilizationPercent >= params.minUtilization)
    .filter((user) => params.maxUtilization === undefined || user.quota.utilizationPercent <= params.maxUtilization)
    .filter((user) => !params.activity || (params.activity === 'active') === user.activity.acceptedRequests + user.activity.rejectedRequests > 0)
    .filter((user) => params.hasRejections === undefined || params.hasRejections === user.activity.rejectedRequests > 0)
    .sort((a, b) => {
      const direction = params.order === 'desc' ? -1 : 1;
      if (params.sort === 'lastActivity') return compareNullsLast(a.activity.lastRequestAt, b.activity.lastRequestAt, direction) || a.id.localeCompare(b.id) * direction;
      const primary =
        params.sort === 'utilization'
          ? a.quota.utilizationPercent - b.quota.utilizationPercent
          : params.sort === 'consumed'
            ? a.quota.consumed - b.quota.consumed
            : params.sort === 'rejected'
              ? a.activity.rejectedRequests - b.activity.rejectedRequests
            : params.sort === 'createdAt'
              ? a.createdAt.localeCompare(b.createdAt)
              : a.externalUserId.localeCompare(b.externalUserId);
      return (primary || a.id.localeCompare(b.id)) * direction;
    });
}
