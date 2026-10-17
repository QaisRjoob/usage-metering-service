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
| 401 | `API_KEY_MISSING`, `API_KEY_INVALID`, `ADMIN_TOKEN_MISSING`, `ADMIN_TOKEN_INVALID`, `CREDENTIAL_INVALID` (login) |
| 403 | `PLAN_READ_ONLY` (predefined plans cannot be edited) |
| 404 | `NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `USER_NOT_FOUND`, `PLAN_NOT_FOUND`, `USAGE_RECORD_NOT_FOUND`, `SIGNUP_REQUEST_NOT_FOUND` (also a wrong claim code) |
| 409 | `USER_ALREADY_EXISTS`, `PLAN_NAME_TAKEN`, `IDEMPOTENCY_KEY_REUSED`, `SIGNUP_ALREADY_PENDING`, `SIGNUP_ALREADY_DECIDED`, `SIGNUP_NOT_APPROVED`, `SIGNUP_ALREADY_CLAIMED` |
| 422 | `PLAN_SCOPE_MISMATCH` (user plan on an account or vice versa) |
| 429 | `RATE_LIMITED` |
| 502 / 503 / 500 | `AI_PROVIDER_ERROR`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR` |

A **quota rejection is not an error**: `POST /usage/consume` answers `200` with `accepted: false`.

## Pagination

List endpoints take `page` (≥ 1, default 1) and `pageSize` (1–100, default 20) and return:

```json
{ "items": [], "page": 1, "pageSize": 20, "totalItems": 0, "totalPages": 0, "hasNextPage": false, "hasPreviousPage": false }
```

Ordering is stable with a unique tie-breaker (history: `created_at DESC, id DESC`). Sorting by
`lastActivity` puts rows that never made a request last in both directions.

Activity (`activity` on account rows and on directory users): `acceptedRequests` and
`rejectedRequests` count consume requests of the selected month; `lastRequestAt` is the latest
request ever (or `null`). "Active" means at least one request in the selected month. Facet counts
follow only the search text (and company / month), not the category filters, so each tab shows how
many rows clicking it would give.

Each list's filters, sort keys and ranges are defined by its query DTO schema in
`backend/src/contracts` (`list*QuerySchema`, `quotasQuerySchema`). Sort keys are a whitelist; `min*`/`max*`
and `from`/`to` pairs must not be reversed; an empty value means "no filter". Violations answer
`400 VALIDATION_ERROR` with the offending field in `details[].path`.

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

### Login helper (no credential header)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/auth/identify` | `{ token }` (any pasted token, trimmed, 1–512 chars) | `{ role: "operator" }` for the admin token, `{ role: "account", account: { id, name, apiKeyPrefix } }` for an API key; anything else → `401 CREDENTIAL_INVALID`. Rate-limited per IP (LOGIN_RATE_LIMIT_PER_MINUTE, default 20). |

The login page uses it to open the right interface from one field. It does not create a session or
cookie: the client then sends the token as `Authorization: Bearer` (operator) or `X-API-Key` (account).

### Self-service sign-up (no credential header)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/signup-requests` | `{ companyName, contactName, contactEmail, planId?, useCase? }` (`planId`: a predefined account plan, default Starter) | `201 { requestId, claimCode, status: "pending", submittedAt }` — the claim code is shown once. Same email with an open request → `409 SIGNUP_ALREADY_PENDING`. Rate-limited per IP (SIGNUP_RATE_LIMIT_PER_MINUTE, default 10). |
| POST | `/signup-requests/status` | `{ requestId, claimCode }` | `SignupRequestStatus { requestId, companyName, contactName, requestedPlanName, status, submittedAt, decidedAt, decisionNote, claimed }`; unknown id or wrong code → `404 SIGNUP_REQUEST_NOT_FOUND` (same answer) |
| POST | `/signup-requests/claim` | `{ requestId, claimCode }` | `ClaimSignupResponse { account, apiKey }` — once; before approval or after a denial → `409 SIGNUP_NOT_APPROVED`, again → `409 SIGNUP_ALREADY_CLAIMED` |

The claim code travels in the JSON body, never in the URL. Status and claim share the login rate limit.

### Operator (admin token)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/admin/accounts` | `{ name, planId? }` (predefined account plan; default Starter) | `201 CreateAccountResponse { account, apiKey }` — the key is shown once |
| GET | `/admin/accounts` | `page, pageSize, search?` (name, account id, API key prefix, or a user's id / display name), `status?, activity?=active\|inactive, hasRejections?, planId?, planKind?, minUsers?, maxUsers?, minUtilization?, maxUtilization?, createdFrom?, createdTo?, month?, sort=name\|createdAt\|utilization\|consumed\|userCount\|lastActivity\|rejected, order=asc\|desc` | `Paginated<AccountListItem>` (each row has `activity { acceptedRequests, rejectedRequests, lastRequestAt }`) |
| GET | `/admin/accounts/facets` | `search?, month?` | `AccountFacets { period, total, byStatus, byPlan[], byActivity { active, inactive } }` |
| GET | `/admin/accounts/:accountId` | `month?` | `AccountDetails` |
| GET | `/admin/accounts/:accountId/users` | same query as `GET /users` | `Paginated<UserWithQuota>` |
| GET | `/admin/accounts/:accountId/usage-summary` | `month?` | `AdminAccountUsageSummary` = `AccountUsageSummary` (requests, daily series, rejections by rule, user status counts, top users) + `monthly` (selected month and the 5 before, this company only) |
| GET | `/admin/accounts/:accountId/users/:userId` | `month?` (`userId` = the company's `externalUserId`) | `AdminUserOverview` = `UserUsageSummary` + `account { id, name }`, `plan`, `activity`, `monthly` (this user only); a user of another company → `404` |
| GET | `/admin/analytics/companies` | `page, pageSize, search?, status?, planId?, activity?, month?, sort=name\|consumed\|utilization\|accepted\|rejected\|rejectionRate\|users\|activeUsers\|lastActivity` (default `consumed desc`), `order` | `CompanyStatsResponse` = `Paginated<CompanyStatsRow>` + `period` + `totals` (over every matching company). Each row: `account`, `quota`, `isCustomPlan`, `users`, `activeUsers`, `requests`, `rejectionRatePercent`, `shareOfUsagePercent` (of all companies' units in the month), `lastRequestAt` |
| GET | `/admin/users` | `page, pageSize, search?` (user id, display name, internal id), `accountId?, planId?, status?, activity?, minUtilization?, maxUtilization?, createdFrom?, createdTo?, month?, sort=externalUserId\|accountName\|createdAt\|utilization\|consumed\|lastActivity\|rejected` (default `lastActivity desc`), `order` | `Paginated<AdminUserListItem>` (user + quota + `account { id, name }` + `activity`) |
| GET | `/admin/users/facets` | `search?, accountId?, month?` | `UserFacets` (same shape as `AccountFacets`) |
| GET | `/admin/search` | `q` (1–100 chars) | `AdminSearchResult { accounts[] (≤ 6), users[] (≤ 6) }`, exact id / key-prefix matches first |
| GET | `/admin/signup-requests` | `page, pageSize, search?` (company, contact, email), `status?=pending\|approved\|rejected, sort=submittedAt\|companyName\|decidedAt, order` | `AdminSignupRequestPage` = `Paginated<AdminSignupRequest>` + `counts { pending, approved, rejected, total }` |
| POST | `/admin/signup-requests/:requestId/approve` | `{ planId?, note? }` | `AdminSignupRequest` — creates the account (same transaction); already decided → `409 SIGNUP_ALREADY_DECIDED` |
| POST | `/admin/signup-requests/:requestId/reject` | `{ note }` (3–500 chars, shown to the applicant) | `AdminSignupRequest` |
| GET | `/admin/plans` | `page, pageSize, search?, scope?, kind?, ownerAccountId?, sort?, order?` | `Paginated<AdminPlanListItem>` (plan + `ownerAccountName`, `assignedAccounts`, `assignedUsers`) |
| GET | `/admin/usage` | same query as `GET /usage`, plus `accountId?` | `Paginated<UsageRecord>` |
| GET | `/admin/analytics/summary` | `month` | `AdminAnalyticsSummary` |

### Account (API key)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/account` | — | `CurrentAccountResponse { account, plan, quota }` |
| PUT | `/account/plan` | `{ planId }` (account-scope plan) | `CurrentAccountResponse` |
| GET | `/account/usage-summary` | `month?` | `AccountUsageSummary` |
| GET | `/users` | `page, pageSize, search?, planId?, status?, activity?=active\|inactive, hasRejections?, minUtilization?, maxUtilization?, createdFrom?, createdTo?, month?, sort=externalUserId\|createdAt\|utilization\|consumed\|lastActivity\|rejected, order` | `Paginated<UserListItem>` (user + quota + `activity`) |
| GET | `/account/user-facets` | `search?, month?` | `UserFacets` — your users per status, plan and activity (within `search`) |
| POST | `/users` | `{ externalUserId, displayName?, planId? }` (default Basic) | `201 UserWithQuota` |
| GET | `/users/:userId` | — | `UserDetails { user, plan, quota, accountQuota }` |
| PUT | `/users/:userId/plan` | `{ planId }` (user-scope plan) | `UserDetails` |
| GET | `/users/:userId/usage-summary` | `month?` | `UserUsageSummary` |
| GET | `/users/:userId/overview` | `month?` | `UserOverview` (same shape as the operator's `AdminUserOverview`: summary + `plan`, `activity`, 6-month `monthly`) |
| GET | `/plans` | `page, pageSize, search?, scope?, kind=predefined\|custom, sort?=name\|createdAt\|monthlyAllowance\|maxUnitsPerRequest, order` | `Paginated<Plan>` (predefined + own custom; no sort = predefined first) |
| POST | `/plans` | `{ name, description?, scope, monthlyAllowance, maxUnitsPerRequest }` | `201 PlanDetails` |
| GET | `/plans/:planId` | — | `PlanDetails` (with all versions) |
| PATCH | `/plans/:planId` | any of `{ name, description, monthlyAllowance, maxUnitsPerRequest }` | `PlanDetails`; limit changes create a new version; predefined → `403 PLAN_READ_ONLY` |
| GET | `/quotas` | same filters and sort as `GET /users`, without `month` (always the current month) | `QuotasOverview { period, account, users: Paginated<UserWithQuota> }` |
| POST | `/quotas/check` | `{ userId, units }` | `QuotaCheckResult` — dry run, never mutates or records |
| POST | `/usage/consume` | `{ userId, units, requestId }` | `ConsumeDecision` (200 for accepted and rejected) |
| GET | `/usage` | `page, pageSize, userId?, outcome?, rule?, level?, minUnits?, maxUnits?, requestId?` (substring), `replayed?` (true/false), `month?, from?, to?, sort=createdAt\|units, order` | `Paginated<UsageRecord>` |
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
  "usageRecordId": "…", "requestId": "doc_123", "userId": "ahmad", "units": 25,
  "accepted": false,
  "rejection": { "rule": "MAX_UNITS_PER_REQUEST", "level": "user", "limit": 20, "requested": 25, "remaining": null, "message": "…" },
  "violations": [ … ],
  "account": { QuotaSnapshot }, "user": { QuotaSnapshot },
  "period": "2026-10", "processedAt": "2026-10-15T12:00:00.000Z",
  "idempotentReplay": false
}
```
