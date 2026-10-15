# API Contracts (v1)

The contract the web app was built against in Phase 1 and that the backend implements. The live
OpenAPI document is served at `GET /api/v1/openapi.json` (Swagger UI at `/docs`).

Rate limits: `POST /ai/advisor` (AI_RATE_LIMIT_PER_WINDOW per credential, default 10/min) and
`POST /admin/accounts` (ACCOUNT_CREATE_RATE_LIMIT_PER_MINUTE per IP, default 30) answer `429 RATE_LIMITED`.
Every response carries `X-Request-Id` (a valid incoming `X-Request-Id` is kept as the correlation id).
A replayed consume decision also carries the header `Idempotent-Replayed: true`. The TypeScript types and request schemas live in [`backend/src/contracts`](../backend/src/contracts) (copied unchanged to `frontend/src/contracts`),
shared by both sides. The mock adapter in `frontend/src/services/mock` implements the same contract
in the browser.

Base URL: `http://localhost:3000/api/v1`. All bodies are JSON. All timestamps are ISO-8601 UTC.
Months are UTC calendar months written `YYYY-MM`.

## Authentication

| Scope | Header | Used by |
|---|---|---|
| Account | `X-API-Key: <account key>` | everything under `/account`, `/users`, `/plans`, `/quotas`, `/usage`, and `/ai/advisor` (account answers) |
| Operator | `Authorization: Bearer <ADMIN_API_TOKEN>` | everything under `/admin`, and `/ai/advisor` (cross-account answers) |
| None | — | `/health`, `/ready` |

- The API key identifies the account. The API never accepts an account id as a replacement for the key.
- Missing key → `401 API_KEY_MISSING`. Unknown key → `401 API_KEY_INVALID`.
- A user, plan or record id that belongs to another account answers `404` (never `403`), so the
  existence of other accounts' data is not revealed.

## Errors

Every non-2xx response has this body:

```json
{ "error": { "code": "USER_NOT_FOUND", "message": "User \"zoe\" was not found in this account.", "requestId": "…", "details": [] } }
```

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR` (`details` = `[{ path, message }]`) |
| 401 | `API_KEY_MISSING`, `API_KEY_INVALID`, `ADMIN_TOKEN_MISSING`, `ADMIN_TOKEN_INVALID` |
| 403 | `PLAN_READ_ONLY` (predefined plans cannot be edited) |
| 404 | `NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `USER_NOT_FOUND`, `PLAN_NOT_FOUND`, `USAGE_RECORD_NOT_FOUND` |
| 409 | `USER_ALREADY_EXISTS`, `PLAN_NAME_TAKEN`, `IDEMPOTENCY_KEY_REUSED` |
| 422 | `PLAN_SCOPE_MISMATCH` (user plan on an account or vice versa) |
| 429 | `RATE_LIMITED` |
| 502 / 503 / 500 | `AI_PROVIDER_ERROR`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR` |

A **quota rejection is not an error**: `POST /usage/consume` answers `200` with `accepted: false`.

## Pagination

List endpoints take `page` (≥ 1, default 1) and `pageSize` (1–100, default 20) and return:

```json
{ "items": [], "page": 1, "pageSize": 20, "totalItems": 0, "totalPages": 0, "hasNextPage": false, "hasPreviousPage": false }
```

Ordering is stable with a unique tie-breaker (history: `created_at DESC, id DESC`).

## Shared shapes

`QuotaSnapshot` — one level (account or user) for one month:

```json
{
  "level": "user", "period": "2026-10",
  "planId": "…", "planName": "Basic", "planVersionId": "…", "planVersion": 1,
  "monthlyAllowance": 1000, "maxUnitsPerRequest": 20,
  "consumed": 40, "remaining": 960, "utilizationPercent": 4, "status": "ok"
}
```

- `remaining = max(0, monthlyAllowance − consumed)`; never negative.
- `utilizationPercent` is the real ratio (1 decimal) and can exceed 100 after an allowance reduction.
- `status`: `ok` (< 80 %), `warning` (≥ 80 %, units left), `exhausted` (remaining 0), `over_allowance` (consumed > allowance).
  An allowance of 0 counts as 100 % utilization.

`RuleViolation`: `{ rule: "MAX_UNITS_PER_REQUEST" | "MONTHLY_ALLOWANCE", level: "account" | "user", limit, requested, remaining, message }`.

Rule evaluation order (first failure is `rejection`; all failures are in `violations`):
1. user `MAX_UNITS_PER_REQUEST` 2. account `MAX_UNITS_PER_REQUEST` 3. user `MONTHLY_ALLOWANCE` 4. account `MONTHLY_ALLOWANCE`.

## Endpoints

### Health
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/ready` | readiness (checks PostgreSQL) |

### Operator (admin token)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/admin/accounts` | `{ name, planId? }` (predefined account plan; default Starter) | `201 CreateAccountResponse { account, apiKey }` — the key is shown once |
| GET | `/admin/accounts` | `page, pageSize, search?, status?, month?, sort=name\|createdAt\|utilization, order=asc\|desc` | `Paginated<AccountListItem>` |
| GET | `/admin/accounts/:accountId` | `month?` | `AccountDetails` |
| GET | `/admin/accounts/:accountId/users` | `page, pageSize, search?, planId?, status?, month?` | `Paginated<UserWithQuota>` |
| GET | `/admin/usage` | `page, pageSize, accountId?, userId?, outcome?, month?, from?, to?` | `Paginated<UsageRecord>` |
| GET | `/admin/analytics/summary` | `month` | `AdminAnalyticsSummary` |

### Account (API key)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/account` | — | `CurrentAccountResponse { account, plan, quota }` |
| PUT | `/account/plan` | `{ planId }` (account-scope plan) | `CurrentAccountResponse` |
| GET | `/account/usage-summary` | `month?` | `AccountUsageSummary` |
| GET | `/users` | `page, pageSize, search?, planId?, status?, month?` | `Paginated<UserWithQuota>` |
| POST | `/users` | `{ externalUserId, displayName?, planId? }` (default Basic) | `201 UserWithQuota` |
| GET | `/users/:userId` | — | `UserDetails { user, plan, quota, accountQuota }` |
| PUT | `/users/:userId/plan` | `{ planId }` (user-scope plan) | `UserDetails` |
| GET | `/users/:userId/usage-summary` | `month?` | `UserUsageSummary` |
| GET | `/plans` | `page, pageSize, scope?, kind=predefined\|custom` | `Paginated<Plan>` (predefined + own custom) |
| POST | `/plans` | `{ name, description?, scope, monthlyAllowance, maxUnitsPerRequest }` | `201 PlanDetails` |
| GET | `/plans/:planId` | — | `PlanDetails` (with all versions) |
| PATCH | `/plans/:planId` | any of `{ name, description, monthlyAllowance, maxUnitsPerRequest }` | `PlanDetails`; limit changes create a new version; predefined → `403 PLAN_READ_ONLY` |
| GET | `/quotas` | `page, pageSize, search?, status?` | `QuotasOverview { period, account, users: Paginated<UserWithQuota> }` |
| POST | `/quotas/check` | `{ userId, units }` | `QuotaCheckResult` — dry run, never mutates or records |
| POST | `/usage/consume` | `{ userId, units, requestId }` | `ConsumeDecision` (200 for accepted and rejected) |
| GET | `/usage` | `page, pageSize, userId?, outcome?, month?, from?, to?` | `Paginated<UsageRecord>` |
| GET | `/usage/:usageId` | — | `UsageRecord` |

`:userId` is always the caller's `externalUserId`.

### AI (either credential; rate-limited)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/ai/advisor` | `{ question, month? }` | `AiAdvisorResponse` — `scope.kind` is `account` with an API key, `global` with the admin token |

## Consume semantics

- `units`: positive whole number (≤ 1,000,000). Strings, decimals, 0 and negatives → `400`.
- Both plans must allow the full amount. A rejection consumes nothing; there is no partial consumption.
- Accepted units are added to both the user's and the account's counter for the UTC month in which the
  request is processed (server time).
- Idempotency scope is `(account, requestId)`; the fingerprint is `(userId, units)`.
  - same key + same payload → the stored decision (accepted **or rejected**) with `idempotentReplay: true`; nothing is consumed again;
  - same key + different payload → `409 IDEMPOTENCY_KEY_REUSED`.
  - Because rejections are stored and replayed, retrying a rejected request needs a **new** `requestId` to be re-evaluated.
- `ConsumeDecision`:

```json
{
  "usageRecordId": "…", "requestId": "doc_123", "userId": "alice", "units": 25,
  "accepted": false,
  "rejection": { "rule": "MAX_UNITS_PER_REQUEST", "level": "user", "limit": 20, "requested": 25, "remaining": null, "message": "…" },
  "violations": [ … ],
  "account": { QuotaSnapshot }, "user": { QuotaSnapshot },
  "period": "2026-10", "processedAt": "2026-10-15T12:00:00.000Z",
  "idempotentReplay": false
}
```
